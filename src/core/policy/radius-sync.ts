// =====================================================================
// POLICY → RADIUS SYNC — single source of truth for pushing policy
// objects into the FreeRADIUS tables (radgroupreply / radgroupcheck /
// radusergroup). Used by all policy CRUD routes so create/update/delete
// stay consistent (the old code only wrote on create — deletes leaked).
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { formatMikrotikRateLimit } from "./engine";

// ---------------------------------------------------------------------
// Group naming — "plan-<kebab-plan-name>" is the convention linking a
// plan to its policy objects. Encoded via encodeURIComponent-style dash
// replacement to stay DNS/RADIUS-name safe.
// ---------------------------------------------------------------------

export function groupNameForPlan(planName: string): string {
  const kebab = planName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `plan-${kebab}`;
}

// ---------------------------------------------------------------------
// Bandwidth profile sync
// ---------------------------------------------------------------------

export interface BandwidthProfileLike {
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  downloadBurst?: number | null;
  uploadBurst?: number | null;
  burstThreshold?: number | null;
  burstTime?: number | null;
  priority?: number;
  sessionLimit?: number | null;
}

/**
 * Upsert radgroupreply (rate attributes) + radgroupcheck (session limits)
 * for a bandwidth profile. Idempotent — safe to call on every create/update.
 */
export async function syncBandwidthProfileToRadius(profile: BandwidthProfileLike): Promise<void> {
  const rateLimit = {
    downloadKbps: profile.downloadSpeed,
    uploadKbps: profile.uploadSpeed,
    downloadBurstKbps: profile.downloadBurst ?? null,
    uploadBurstKbps: profile.uploadBurst ?? null,
    burstThresholdKbps: profile.burstThreshold ?? null,
    burstTimeSec: profile.burstTime ?? null,
  };
  const mrl = formatMikrotikRateLimit(rateLimit);

  const replies: Array<{ attribute: string; value: string }> = [
    { attribute: "Mikrotik-Rate-Limit", value: mrl },
    {
      attribute: "WISPr-Bandwidth-Max-Down",
      value: String(Math.max(0, Math.round(profile.downloadSpeed * 1000 / 8))), // bits/s
    },
    {
      attribute: "WISPr-Bandwidth-Max-Up",
      value: String(Math.max(0, Math.round(profile.uploadSpeed * 1000 / 8))),
    },
  ];

  await db.$transaction([
    ...replies.map((r) =>
      db.radGroupReply.upsert({
        where: { groupname_attribute: { groupname: profile.name, attribute: r.attribute } },
        create: { groupname: profile.name, attribute: r.attribute, op: "=", value: r.value },
        update: { value: r.value, op: "=" },
      })
    ),
    // Session limits in radgroupcheck
    ...(profile.sessionLimit != null
      ? [
          db.radGroupCheck.upsert({
            where: { groupname_attribute: { groupname: profile.name, attribute: "Simultaneous-Use" } },
            create: {
              groupname: profile.name,
              attribute: "Simultaneous-Use",
              op: ":=",
              value: String(profile.sessionLimit),
            },
            update: { value: String(profile.sessionLimit) },
          }),
        ]
      : []),
  ]);
}

/** Remove every RADIUS row for a group. Call on profile delete. */
export async function removeGroupFromRadius(groupName: string): Promise<void> {
  await db.$transaction([
    db.radGroupReply.deleteMany({ where: { groupname: groupName } }),
    db.radGroupCheck.deleteMany({ where: { groupname: groupName } }),
  ]);
}

// ---------------------------------------------------------------------
// QoS queue sync
// ---------------------------------------------------------------------

export interface QosQueueLike {
  name: string;
  priority: number;
  rateLimit?: number | null;
  ceilLimit?: number | null;
}

const PRIORITY_TO_DSCP: Record<number, number> = {
  1: 46, 2: 46, 3: 34, 4: 34, 5: 26, 6: 18, 7: 10, 8: 0,
};

export async function syncQosQueueToRadius(queue: QosQueueLike): Promise<void> {
  const dscp = PRIORITY_TO_DSCP[queue.priority] ?? 0;
  await db.radGroupReply.upsert({
    where: {
      groupname_attribute: {
        groupname: queue.name,
        attribute: "Mikrotik-QoS-DSCP", // informative; real marking happens on NAS
      },
    },
    create: { groupname: queue.name, attribute: "Mikrotik-QoS-DSCP", op: "=", value: String(dscp) },
    update: { value: String(dscp) },
  });
}

// ---------------------------------------------------------------------
// Time access sync
// ---------------------------------------------------------------------

export interface TimeAccessLike {
  name: string;
  schedule: string; // JSON
  action: string; // allow | deny
}

/**
 * Convert the schedule JSON into a FreeRADIUS `Login-Time` expression:
 *   {"mon":[{"start":"08:00","end":"22:00"}], ...} → "Mo0800-2200"
 * Deny-profiles invert: express the complement window "Any0000-2359" style
 * except blocked windows is not expressible in Login-Time — deny profiles
 * are enforced by the policy engine at auth time, so we only sync allow
 * windows; deny schedules produce no Login-Time attribute.
 */
export function scheduleToLoginTime(scheduleJson: string): string | null {
  const DAY_ABBR: Record<string, string> = {
    sun: "Su", mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa",
  };
  let schedule: Record<string, Array<{ start: string; end: string }>>;
  try {
    schedule = JSON.parse(scheduleJson);
  } catch {
    return null;
  }
  const parts: string[] = [];
  for (const [day, windows] of Object.entries(schedule)) {
    const abbr = DAY_ABBR[day.toLowerCase()];
    if (!abbr || !Array.isArray(windows)) continue;
    for (const w of windows) {
      if (!w?.start || !w?.end) continue;
      const start = w.start.replace(":", "");
      const end = w.end.replace(":", "");
      if (start === "0000" && end === "2359") {
        parts.push(abbr);
      } else {
        parts.push(`${abbr}${start}-${end}`);
      }
    }
  }
  return parts.length > 0 ? parts.join(",") : null;
}

export async function syncTimeAccessToRadius(profile: TimeAccessLike): Promise<void> {
  const loginTime = scheduleToLoginTime(profile.schedule);
  if (profile.action !== "allow" || !loginTime) {
    // deny-profiles: remove any stale Login-Time rows
    await db.radGroupCheck.deleteMany({
      where: { groupname: profile.name, attribute: "Login-Time" },
    });
    return;
  }
  await db.radGroupCheck.upsert({
    where: { groupname_attribute: { groupname: profile.name, attribute: "Login-Time" } },
    create: { groupname: profile.name, attribute: "Login-Time", op: ":=", value: loginTime },
    update: { value: loginTime },
  });
}

// ---------------------------------------------------------------------
// Subscriber ↔ group assignment
// ---------------------------------------------------------------------

/** Point a subscriber's RADIUS user at a policy group (radusergroup). */
export async function assignSubscriberToGroup(username: string, groupName: string): Promise<void> {
  const existing = await db.radUserGroup.findFirst({ where: { username } });
  if (existing) {
    if (existing.groupname === groupName) return;
    await db.radUserGroup.update({ where: { id: existing.id }, data: { groupname: groupName } });
  } else {
    await db.radUserGroup.create({ data: { username, groupname: groupName, priority: 1 } });
  }
}

/** Remove a subscriber's RADIUS user-group mapping + auth rows (terminate). */
export async function removeSubscriberRadiusIdentity(username: string): Promise<void> {
  await db.$transaction([
    db.radUserGroup.deleteMany({ where: { username } }),
    db.radCheck.deleteMany({ where: { username } }),
    db.radReply.deleteMany({ where: { username } }),
  ]);
}
