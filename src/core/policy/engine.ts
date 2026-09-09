// =====================================================================
// POLICY EVALUATION ENGINE
// The "brain" of the policy subsystem. Given a subscriber, resolves the
// EFFECTIVE policy that must be enforced on their active sessions —
// merging plan defaults, bandwidth profiles, QoS queues, time-access
// profiles, charge overrides, FUP throttling and account status.
//
// Resolution order (later overrides earlier):
//   1. Plan-derived defaults (downloadSpeed/uploadSpeed/dataCap)
//   2. BandwidthProfile assigned to the subscriber's plan group (if any)
//   3. QoS queue (priority + ceil)
//   4. Time-access profile (is access allowed RIGHT NOW?)
//   5. FUP: if data cap exceeded → throttle to FAP rate
//   6. Account status: suspended/terminated → hard block (Auth-Type Reject)
//   7. Active charge override (surcharge/discount does NOT touch rate)
//
// All numeric rates are in kbps. Output is a single, machine-enforceable
// policy descriptor used by the RADIUS worker / CoA dispatcher.
// =====================================================================

import "server-only";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface EffectiveRateLimit {
  downloadKbps: number;
  uploadKbps: number;
  downloadBurstKbps?: number | null;
  uploadBurstKbps?: number | null;
  burstThresholdKbps?: number | null;
  burstTimeSec?: number | null;
}

export interface EffectiveQos {
  priority: number; // 1-8 (1 = highest)
  ceilKbps?: number | null;
  queueType?: string | null;
  dscp?: number | null; // DSCP marking derived from priority
}

export interface TimeAccessDecision {
  allowed: boolean;
  reason: "no_profile" | "within_schedule" | "outside_schedule" | "suspended";
  profileName?: string;
  nextChangeAt?: Date; // when the decision will flip
  timezone?: string;
}

export interface FupDecision {
  applicable: boolean; // true if subscriber has a data cap
  capMb: number | null;
  usedMb: number;
  utilizationPct: number;
  throttled: boolean;
  throttledRateKbps?: number | null;
  resetAt?: Date | null; // when the cap resets (next billing cycle)
}

export type EnforcementAction =
  | "allow" // normal: apply rate limit, allow session
  | "throttle" // FUP exceeded: apply throttled rate
  | "time_block" // outside allowed time window
  | "block"; // account suspended/terminated

export interface EffectivePolicy {
  subscriberId: string;
  username: string | null;
  customerId: string;
  planId: string | null;
  planName: string | null;
  accountStatus: string;
  enforcement: EnforcementAction;
  rateLimit: EffectiveRateLimit;
  qos: EffectiveQos;
  timeAccess: TimeAccessDecision;
  fup: FupDecision;
  // RADIUS group the subscriber is mapped to (radusergroup.groupname)
  radiusGroup: string | null;
  // Compiled RADIUS reply attributes that should be pushed via CoA
  radiusAttributes: RadiusAttribute[];
  // Human-readable summary for audit / UI
  summary: string;
  evaluatedAt: Date;
}

export interface RadiusAttribute {
  attribute: string;
  op: string; // :=, ==, +=
  value: string;
}

// ---------------------------------------------------------------------
// DSCP mapping — priority 1 (highest) → EF, 8 (lowest) → BE
// ---------------------------------------------------------------------
const PRIORITY_TO_DSCP: Record<number, number> = {
  1: 46, // EF  (Expedited Forwarding)
  2: 46,
  3: 34, // AF41
  4: 34,
  5: 26, // AF31
  6: 18, // AF21
  7: 10, // AF11
  8: 0,  // BE  (Best Effort)
};

// ---------------------------------------------------------------------
// Main entrypoint: evaluate the effective policy for a subscriber
// ---------------------------------------------------------------------
export async function evaluateSubscriberPolicy(
  tenantId: string,
  subscriberId: string,
  options?: {
    usageOverrideMb?: number;
    context?: string; // auth | api | enforcement | coa | scheduled
    persist?: boolean; // persist a PolicyDecision row
    actorUserId?: string;
  }
): Promise<EffectivePolicy> {
  // 1. Load subscriber + plan
  const subscriber = await db.subscriber.findFirst({
    where: { id: subscriberId, tenantId },
    include: {
      plan: true,
      activeSessions: {
        where: { status: "active" },
        select: {
          id: true,
          sessionId: true,
          nasId: true,
          framedIpAddress: true,
          inputOctets: true,
          outputOctets: true,
          startTime: true,
        },
      },
    },
  });

  if (!subscriber) {
    throw new Error(`Subscriber ${subscriberId} not found`);
  }

  // 1b. Subscriber-level policy overrides (from Subscriber.policyOverrides JSON)
  const overrides = parsePolicyOverrides(subscriber.policyOverrides);

  // 2. Resolve the RADIUS group from radusergroup
  const radUserGroup = subscriber.username
    ? await db.radUserGroup.findFirst({
        where: { username: subscriber.username },
        select: { groupname: true },
      })
    : null;
  const radiusGroup = radUserGroup?.groupname ?? null;

  // 3. Pull RADIUS reply attributes already configured for this group
  let radiusAttributes: RadiusAttribute[] = [];
  if (radiusGroup) {
    const groupReplies = await db.radGroupReply.findMany({
      where: { groupname: radiusGroup },
      select: { attribute: true, op: true, value: true },
    });
    radiusAttributes = groupReplies.map((r) => ({
      attribute: r.attribute,
      op: r.op,
      value: r.value,
    }));
  }

  // 4. Compute base rate from plan
  const plan = subscriber.plan;
  let rateLimit: EffectiveRateLimit = {
    downloadKbps: plan?.downloadSpeed ?? 0,
    uploadKbps: plan?.uploadSpeed ?? 0,
  };

  // 4b. Apply subscriber-level speed caps (overrides never raise above profile)
  if (overrides.downloadKbpsCap != null) {
    rateLimit.downloadKbps = Math.min(rateLimit.downloadKbps, overrides.downloadKbpsCap);
  }
  if (overrides.uploadKbpsCap != null) {
    rateLimit.uploadKbps = Math.min(rateLimit.uploadKbps, overrides.uploadKbpsCap);
  }

  // 5. Try to enrich rate from a BandwidthProfile matching the RADIUS group
  //    (the bandwidth API creates group "plan-<name>" on profile creation)
  if (radiusGroup) {
    const profileName = radiusGroup.startsWith("plan-")
      ? decodeGroupName(radiusGroup)
      : radiusGroup;
    const bwProfile = await db.bandwidthProfile.findFirst({
      where: {
        tenantId,
        name: profileName,
        status: "active",
      },
    });
    if (bwProfile) {
      rateLimit = {
        downloadKbps: bwProfile.downloadSpeed,
        uploadKbps: bwProfile.uploadSpeed,
        downloadBurstKbps: bwProfile.downloadBurst,
        uploadBurstKbps: bwProfile.uploadBurst,
        burstThresholdKbps: bwProfile.burstThreshold,
        burstTimeSec: bwProfile.burstTime,
      };
      // Re-apply subscriber caps on top of the profile
      if (overrides.downloadKbpsCap != null) {
        rateLimit.downloadKbps = Math.min(rateLimit.downloadKbps, overrides.downloadKbpsCap);
      }
      if (overrides.uploadKbpsCap != null) {
        rateLimit.uploadKbps = Math.min(rateLimit.uploadKbps, overrides.uploadKbpsCap);
      }
    }
  }

  // 6. QoS — look up QosQueue for the group
  let qos: EffectiveQos = { priority: 8 };
  if (radiusGroup) {
    const qosQueue = await db.qosQueue.findFirst({
      where: { tenantId, name: radiusGroup, status: "active" },
    });
    if (qosQueue) {
      qos = {
        priority: qosQueue.priority,
        ceilKbps: qosQueue.ceilLimit,
        queueType: qosQueue.type,
        dscp: PRIORITY_TO_DSCP[qosQueue.priority] ?? 0,
      };
    }
  }

  // 7. Time access — check if access is allowed RIGHT NOW
  const timeAccess = await evaluateTimeAccess(tenantId, radiusGroup);

  // 7b. Subscriber-level alwaysAllow override (VIP whitelist)
  if (overrides.alwaysAllow === true) {
    timeAccess.allowed = true;
    timeAccess.reason = "no_profile";
  }

  // 8. FUP — fair usage policy (cap: plan.dataCap, overridable per-subscriber)
  const effectiveCapMb = overrides.dataCapOverrideMb ?? plan?.dataCap ?? null;
  const fup = await evaluateFup(
    tenantId,
    subscriberId,
    effectiveCapMb,
    options?.usageOverrideMb,
    plan?.billingCycle ?? null,
    anchor,
    overrides.fupThrottleKbps
  );

  // 9. Determine enforcement action + apply FUP throttle if needed
  let enforcement: EnforcementAction = "allow";
  const summaryParts: string[] = [];

  // Account status hard-blocks everything
  if (
    subscriber.status === "suspended" ||
    subscriber.status === "terminated"
  ) {
    enforcement = "block";
    summaryParts.push(`account ${subscriber.status.toUpperCase()}`);
  } else if (!timeAccess.allowed) {
    enforcement = "time_block";
    summaryParts.push(
      `time-blocked (${timeAccess.reason}${timeAccess.profileName ? `: ${timeAccess.profileName}` : ""})`
    );
  } else if (fup.throttled) {
    enforcement = "throttle";
    // Apply FUP throttle rate — overrides the normal rate limit
    // Default throttle: 25% of normal (floor 1 Mbps); configurable per-subscriber
    const pctDown = overrides.fupThrottleKbps ?? Math.max(1024, Math.round(rateLimit.downloadKbps * 0.25));
    const pctUp = overrides.fupThrottleKbps ?? Math.max(512, Math.round(rateLimit.uploadKbps * 0.25));
    rateLimit = {
      downloadKbps: pctDown,
      uploadKbps: pctUp,
    };
    summaryParts.push(
      `FUP throttled ${fup.utilizationPct.toFixed(0)}% of ${fup.capMb}MB cap`
    );
  } else {
    summaryParts.push(
      `${formatKbps(rateLimit.downloadKbps)}↓/${formatKbps(rateLimit.uploadKbps)}↑`
    );
  }

  if (timeAccess.allowed && timeAccess.nextChangeAt && enforcement === "allow") {
    summaryParts.push(`time-window ends ${timeAccess.nextChangeAt.toISOString()}`);
  }

  const summary = summaryParts.join(" · ");

  const policy: EffectivePolicy = {
    subscriberId: subscriber.id,
    username: subscriber.username,
    customerId: subscriber.customerId,
    planId: subscriber.planId,
    planName: plan?.name ?? null,
    accountStatus: subscriber.status,
    enforcement,
    rateLimit,
    qos,
    timeAccess,
    fup,
    radiusGroup,
    radiusAttributes,
    summary,
    evaluatedAt: new Date(),
  };

  // 10. Persist decision (compliance / traceability)
  if (options?.persist) {
    try {
      await db.policyDecision.create({
        data: {
          tenantId,
          subscriberId: subscriber.id,
          username: subscriber.username,
          context: options.context ?? "api",
          decision:
            enforcement === "block" ? "deny" : enforcement === "throttle" ? "allow_degraded" : "allow",
          reason: summary,
          result: JSON.stringify(policy),
        },
      });
    } catch {
      // decision persistence must never break enforcement
    }
  }

  return policy;
}

// ---------------------------------------------------------------------
// Subscriber policy overrides parser
// ---------------------------------------------------------------------
export interface SubscriberPolicyOverrides {
  downloadKbpsCap?: number | null;
  uploadKbpsCap?: number | null;
  dataCapOverrideMb?: number | null;
  fupThrottleKbps?: number | null;
  alwaysAllow?: boolean;
}

function parsePolicyOverrides(raw: string | null | undefined): SubscriberPolicyOverrides {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: SubscriberPolicyOverrides = {};
    if (typeof parsed.downloadKbpsCap === "number") out.downloadKbpsCap = parsed.downloadKbpsCap;
    if (typeof parsed.uploadKbpsCap === "number") out.uploadKbpsCap = parsed.uploadKbpsCap;
    if (typeof parsed.dataCapOverrideMb === "number") out.dataCapOverrideMb = parsed.dataCapOverrideMb;
    if (typeof parsed.fupThrottleKbps === "number") out.fupThrottleKbps = parsed.fupThrottleKbps;
    if (typeof parsed.alwaysAllow === "boolean") out.alwaysAllow = parsed.alwaysAllow;
    return out;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------
// FUP evaluation: data cap vs. actual usage (from RadAcct / active sessions)
// ---------------------------------------------------------------------
async function evaluateFup(
  tenantId: string,
  subscriberId: string,
  capMb: number | null,
  usageOverrideMb?: number,
  billingCycle?: string | null,
  anchor?: Date | null,
  fupThrottleKbps?: number | null
): Promise<FupDecision> {
  if (!capMb || capMb <= 0) {
    return {
      applicable: false,
      capMb: null,
      usedMb: 0,
      utilizationPct: 0,
      throttled: false,
    };
  }

  // Cycle-aware usage window (anchored to the subscriber's billing cycle)
  let windowStart: Date;
  let resetAt: Date;
  try {
    const { parseCycle, getCycleBounds } = await import("@/core/billing/cycle");
    const cycle = parseCycle(billingCycle ?? undefined);
    const bounds = getCycleBounds(cycle, anchor ?? new Date(), new Date());
    windowStart = bounds.periodStart;
    resetAt = bounds.periodEnd;
  } catch {
    const now = new Date();
    windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  let usedMb: number;
  if (usageOverrideMb !== undefined) {
    usedMb = usageOverrideMb;
  } else {
    // Sum octets from current billing cycle's session history + active sessions
    const [historyAgg, activeAgg] = await Promise.all([
      db.sessionHistory.aggregate({
        _sum: { inputOctets: true, outputOctets: true },
        where: {
          tenantId,
          subscriberId,
          startTime: { gte: windowStart },
        },
      }),
      db.activeSession.aggregate({
        _sum: { inputOctets: true, outputOctets: true },
        where: {
          tenantId,
          subscriberId,
          status: "active",
        },
      }),
    ]);

    const inputOctets =
      (historyAgg._sum.inputOctets ?? 0) + (activeAgg._sum.inputOctets ?? 0);
    const outputOctets =
      (historyAgg._sum.outputOctets ?? 0) + (activeAgg._sum.outputOctets ?? 0);
    usedMb = (inputOctets + outputOctets) / (1024 * 1024);
  }

  const utilizationPct = (usedMb / capMb) * 100;
  const throttled = usedMb >= capMb;

  // FUP throttle rate: configurable per-subscriber, else 1 Mbps floor
  const throttledRateKbps = throttled ? (fupThrottleKbps ?? 1024) : null;

  return {
    applicable: true,
    capMb,
    usedMb: Math.round(usedMb),
    utilizationPct,
    throttled,
    throttledRateKbps,
    resetAt,
  };
}

// ---------------------------------------------------------------------
// Time access evaluation: is access allowed RIGHT NOW per the schedule?
// ---------------------------------------------------------------------
async function evaluateTimeAccess(
  tenantId: string,
  radiusGroup: string | null
): Promise<TimeAccessDecision> {
  // Look up a TimeAccessProfile whose name matches the group
  let profile = null;
  if (radiusGroup) {
    profile = await db.timeAccessProfile.findFirst({
      where: {
        tenantId,
        name: radiusGroup,
        status: "active",
      },
    });
  }

  if (!profile) {
    return { allowed: true, reason: "no_profile" };
  }

  const now = new Date();
  const allowed = isWithinSchedule(profile.schedule, profile.timezone, now);

  // Compute next change time (when the current decision flips)
  const nextChangeAt = computeNextScheduleChange(
    profile.schedule,
    profile.timezone,
    now
  );

  return {
    allowed,
    reason: allowed ? "within_schedule" : "outside_schedule",
    profileName: profile.name,
    nextChangeAt,
    timezone: profile.timezone,
  };
}

// ---------------------------------------------------------------------
// Schedule helpers — parse the JSON schedule and check against `now`
// Schedule format: { "mon": [{"start":"08:00","end":"22:00"}], "tue": ... }
// ---------------------------------------------------------------------
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

function isWithinSchedule(scheduleJson: string, timezone: string, now: Date): boolean {
  let schedule: Record<string, Array<{ start: string; end: string }>>;
  try {
    schedule = JSON.parse(scheduleJson);
  } catch {
    return true; // malformed schedule → permissive
  }

  const tzNow = toZonedTime(now, timezone);
  const dayKey = DAY_KEYS[tzNow.getUTCDay()] as DayKey;
  const windows = schedule[dayKey];
  if (!windows || windows.length === 0) return false; // no window today → denied

  const minutesNow = tzNow.getUTCHours() * 60 + tzNow.getUTCMinutes();
  return windows.some((w) => {
    const [sh, sm] = w.start.split(":").map(Number);
    const [eh, em] = w.end.split(":").map(Number);
    return minutesNow >= sh * 60 + sm && minutesNow < eh * 60 + em;
  });
}

function computeNextScheduleChange(
  scheduleJson: string,
  timezone: string,
  now: Date
): Date | undefined {
  let schedule: Record<string, Array<{ start: string; end: string }>>;
  try {
    schedule = JSON.parse(scheduleJson);
  } catch {
    return undefined;
  }

  const tzNow = toZonedTime(now, timezone);
  // Scan the next 7 days, 5-min granularity, to find the first flip.
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const probe = new Date(tzNow.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayKey = DAY_KEYS[probe.getUTCDay()] as DayKey;
    const windows = schedule[dayKey];
    if (!windows || windows.length === 0) continue;
    for (const w of windows) {
      const [sh, sm] = w.start.split(":").map(Number);
      const windowStart = new Date(probe);
      windowStart.setUTCHours(sh, sm, 0, 0);
      if (windowStart.getTime() > now.getTime()) {
        return fromZonedTime(windowStart, timezone);
      }
    }
  }
  return undefined;
}

// Minimal timezone offset helpers (no external Intl polyfill needed for common offsets).
function toZonedTime(date: Date, timezone: string): Date {
  const offsetMs = tzOffsetMs(timezone);
  return new Date(date.getTime() + offsetMs);
}
function fromZonedTime(date: Date, timezone: string): Date {
  const offsetMs = tzOffsetMs(timezone);
  return new Date(date.getTime() - offsetMs);
}
function tzOffsetMs(timezone: string): number {
  // Approximate — supports the most common ISP operating zones.
  // Production would use Luxon/Intl with full DST tables.
  switch (timezone) {
    case "UTC":
    case "Europe/London":
      return 0;
    case "Asia/Kolkata":
      return 5.5 * 3600 * 1000;
    case "Asia/Shanghai":
    case "Asia/Singapore":
      return 8 * 3600 * 1000;
    case "America/New_York":
      return -5 * 3600 * 1000;
    case "America/Los_Angeles":
      return -8 * 3600 * 1000;
    case "Asia/Dubai":
      return 4 * 3600 * 1000;
    case "Asia/Tokyo":
      return 9 * 3600 * 1000;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------
// Billing cycle start: delegated to the cycle engine (subscriber-anchored)
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Build the Mikrotik-Rate-Limit string from an EffectiveRateLimit
//   "down/up [burst-down/burst-up [burst-threshold-down/up [burst-time]]]"
// ---------------------------------------------------------------------
export function formatMikrotikRateLimit(r: EffectiveRateLimit): string {
  const down = formatKbps(r.downloadKbps);
  const up = formatKbps(r.uploadKbps);
  if (
    r.downloadBurstKbps &&
    r.uploadBurstKbps &&
    r.burstThresholdKbps &&
    r.burstTimeSec
  ) {
    return [
      down,
      up,
      `${formatKbps(r.downloadBurstKbps)}/${formatKbps(r.uploadBurstKbps)}`,
      `${formatKbps(r.burstThresholdKbps)}/${formatKbps(r.burstThresholdKbps)}`,
      `${r.burstTimeSec}`,
    ].join(" ");
  }
  return `${down}/${up}`;
}

export function formatKbps(kbps: number): string {
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(2)}G`;
  if (kbps >= 1000) return `${Math.round(kbps / 1000)}M`;
  return `${kbps}K`;
}

function decodeGroupName(group: string): string {
  // "plan-basic-broadband" → "Basic Broadband"
  const stripped = group.replace(/^plan-/, "");
  return stripped
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
