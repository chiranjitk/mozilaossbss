// =====================================================================
// RADIUS AUTHENTICATOR — business logic for Access-Request packets
// Looks up subscriber by username, verifies password, checks plan/status,
// builds Access-Accept/Reject with authorization attributes.
// =====================================================================

import { PrismaClient } from "@prisma/client";
import {
  PacketCode,
  Attribute,
  AcctStatusType,
  stringAttr,
  intAttr,
  ipAttr,
  vsaString,
  vsaInt,
  VENDOR_MIKROTIK,
  VENDOR_WISPR,
  MIKROTIK_RATE_LIMIT,
  WISPR_BW_MAX_DOWN,
  WISPR_BW_MAX_UP,
  decryptUserPassword,
  type RadiusPacket,
  type RadiusAttribute,
} from "./packet";
import { verifyPassword } from "./password";

const db = new PrismaClient({
  log: ["warn", "error"],
});

export interface AuthResult {
  accept: boolean;
  attributes: RadiusAttribute[];
  subscriberId?: string;
  username: string;
  nasId?: string;
  replyMessage?: string;
}

/**
 * Process a RADIUS Access-Request.
 * - Looks up NAS by source IP + shared secret
 * - Looks up subscriber by User-Name
 * - Verifies password
 * - Checks subscriber status (active only)
 * - Checks plan bandwidth/session limits
 * - Returns Access-Accept with authorization attributes
 */
export async function handleAccessRequest(
  packet: RadiusPacket,
  nasIp: string
): Promise<AuthResult> {
  const username =
    packet.attributes.find((a) => a.type === Attribute.USER_NAME)?.value.toString("utf8") ?? "";

  if (!username) {
    return {
      accept: false,
      attributes: [stringAttr(Attribute.REPLY_MESSAGE, "Missing User-Name")],
      username: "",
    };
  }

  // 1. Find NAS client
  const nas = await db.nasClient.findFirst({
    where: { ipAddress: nasIp, status: "active" },
  });
  if (!nas) {
    console.warn(`[radius] NAS not found or inactive: ${nasIp}`);
    return {
      accept: false,
      attributes: [stringAttr(Attribute.REPLY_MESSAGE, "Unknown NAS")],
      username,
    };
  }

  // 2. Find subscriber by username
  const subscriber = await db.subscriber.findUnique({
    where: { username },
    include: { plan: true, tenant: true },
  });
  if (!subscriber) {
    console.warn(`[radius] Subscriber not found: ${username}`);
    return {
      accept: false,
      attributes: [stringAttr(Attribute.REPLY_MESSAGE, "Invalid credentials")],
      username,
      nasId: nas.id,
    };
  }

  // 3. Check subscriber status
  if (subscriber.status !== "active") {
    console.warn(
      `[radius] Subscriber ${username} is ${subscriber.status} (rejected)`
    );
    return {
      accept: false,
      attributes: [
        stringAttr(
          Attribute.REPLY_MESSAGE,
          subscriber.status === "suspended"
            ? "Account suspended. Please contact support."
            : subscriber.status === "terminated"
              ? "Account terminated."
              : "Account not active."
        ),
      ],
      username,
      subscriberId: subscriber.id,
      nasId: nas.id,
    };
  }

  // 4. Verify password (User-Password attribute, RFC 2865 §5.2)
  const userPasswordAttr = packet.attributes.find(
    (a) => a.type === Attribute.USER_PASSWORD
  );
  if (!userPasswordAttr) {
    console.warn(`[radius] Missing password for ${username}`);
    return {
      accept: false,
      attributes: [stringAttr(Attribute.REPLY_MESSAGE, "Invalid credentials")],
      username,
      subscriberId: subscriber.id,
      nasId: nas.id,
    };
  }

  const plainPassword = decryptUserPassword(
    userPasswordAttr.value,
    nas.sharedSecret,
    packet.authenticator
  );

  // FreeRADIUS flow: prefer the radcheck Cleartext-Password row (provisioned
  // by the admin app), fall back to the subscriber's scrypt hash.
  const radCheckRow = await db.radCheck.findFirst({
    where: { username, attribute: { in: ["Cleartext-Password", "User-Password"] } },
  });

  let passwordValid = false;
  if (radCheckRow) {
    passwordValid = radCheckRow.value === plainPassword;
  } else if (subscriber.passwordHash) {
    passwordValid = await verifyPassword(plainPassword, subscriber.passwordHash);
  } else {
    console.warn(`[radius] No password source for ${username} (no radcheck row, no hash)`);
  }

  if (!passwordValid) {
    console.warn(`[radius] Invalid password for ${username}`);
    return {
      accept: false,
      attributes: [stringAttr(Attribute.REPLY_MESSAGE, "Invalid credentials")],
      username,
      subscriberId: subscriber.id,
      nasId: nas.id,
    };
  }

  // 5. Resolve the RADIUS policy group (radusergroup), fall back to plan convention
  const radUserGroup = await db.radUserGroup.findFirst({ where: { username } });
  const groupName =
    radUserGroup?.groupname ??
    (subscriber.plan ? `plan-${subscriber.plan.name.toLowerCase().replace(/\s+/g, "-")}` : null);

  // 6. Group-level check attributes: Simultaneous-Use overrides plan.sessionLimit
  let sessionLimit = subscriber.plan?.sessionLimit ?? 1;
  const groupCheckRows = groupName
    ? await db.radGroupCheck.findMany({ where: { groupname: groupName } })
    : [];
  for (const row of groupCheckRows) {
    if (row.attribute === "Simultaneous-Use") {
      const v = parseInt(row.value, 10);
      if (Number.isFinite(v) && v > 0) sessionLimit = v;
    }
    if (row.attribute === "Login-Time") {
      // Enforce the time window at auth time (parsed from Login-Time syntax)
      if (!isWithinLoginTime(row.value, new Date())) {
        console.warn(`[radius] ${username} blocked: outside Login-Time window (${row.value})`);
        return {
          accept: false,
          attributes: [
            stringAttr(
              Attribute.REPLY_MESSAGE,
              "Service unavailable at this time. Check your plan's allowed hours."
            ),
          ],
          username,
          subscriberId: subscriber.id,
          nasId: nas.id,
        };
      }
    }
  }

  // 7. Check active session limit
  const activeSessions = await db.activeSession.count({
    where: { subscriberId: subscriber.id, status: "active" },
  });
  if (activeSessions >= sessionLimit) {
    console.warn(
      `[radius] Session limit reached for ${username}: ${activeSessions}/${sessionLimit}`
    );
    return {
      accept: false,
      attributes: [
        stringAttr(
          Attribute.REPLY_MESSAGE,
          `Session limit reached (${sessionLimit}). Disconnect an existing session first.`
        ),
      ],
      username,
      subscriberId: subscriber.id,
      nasId: nas.id,
    };
  }

  // 8. Build authorization attributes from radgroupreply (the policy tables
  //    the admin app syncs bandwidth/QoS/time profiles into) + sane defaults.
  const attrs: RadiusAttribute[] = [];

  // Session-Timeout (seconds) — default 86400 (24h) if not specified
  attrs.push(intAttr(Attribute.SESSION_TIMEOUT, 86400));

  // Idle-Timeout — 1800s (30min)
  attrs.push(intAttr(Attribute.IDLE_TIMEOUT, 1800));

  if (groupName) {
    const groupReplyRows = await db.radGroupReply.findMany({
      where: { groupname: groupName },
    });

    // Pass through every configured reply attribute; known ones are also
    // re-encoded as proper VSAs below.
    for (const row of groupReplyRows) {
      switch (row.attribute) {
        case "Session-Timeout": {
          const v = parseInt(row.value, 10);
          if (Number.isFinite(v) && v > 0) {
            // replace the default we just pushed
            const idx = attrs.findIndex((a) => a.type === Attribute.SESSION_TIMEOUT);
            if (idx >= 0) attrs[idx] = intAttr(Attribute.SESSION_TIMEOUT, v);
          }
          break;
        }
        case "Idle-Timeout": {
          const v = parseInt(row.value, 10);
          if (Number.isFinite(v) && v > 0) {
            const idx = attrs.findIndex((a) => a.type === Attribute.IDLE_TIMEOUT);
            if (idx >= 0) attrs[idx] = intAttr(Attribute.IDLE_TIMEOUT, v);
          }
          break;
        }
        case "Mikrotik-Rate-Limit":
          attrs.push(vsaString(VENDOR_MIKROTIK, MIKROTIK_RATE_LIMIT, row.value));
          break;
        case "WISPr-Bandwidth-Max-Down":
          attrs.push(vsaInt(VENDOR_WISPR, WISPR_BW_MAX_DOWN, parseBps(row.value)));
          break;
        case "WISPr-Bandwidth-Max-Up":
          attrs.push(vsaInt(VENDOR_WISPR, WISPR_BW_MAX_UP, parseBps(row.value)));
          break;
        default:
          // Unknown attribute → pass through as a string AVP if it maps to a
          // standard type, otherwise skip (unknown type 0 is invalid).
          break;
      }
    }
  } else if (subscriber.plan?.downloadSpeed && subscriber.plan?.uploadSpeed) {
    // No group mapped: fall back to plan-derived rates via MikroTik VSA
    attrs.push(
      vsaString(
        VENDOR_MIKROTIK,
        MIKROTIK_RATE_LIMIT,
        `${subscriber.plan.downloadSpeed}/${subscriber.plan.uploadSpeed}`
      )
    );
  }

  // Framed-Protocol = PPP (7 -> value 1)
  attrs.push(intAttr(Attribute.FRAMED_PROTOCOL, 1));

  // Service-Type = Framed-User (6 -> value 2)
  attrs.push(intAttr(Attribute.SERVICE_TYPE, 2));

  console.log(
    `[radius] ACCEPT ${username} from ${nasIp} (subscriber ${subscriber.customerId}, group ${groupName ?? "none"})`
  );

  return {
    accept: true,
    attributes: attrs,
    subscriberId: subscriber.id,
    username,
    nasId: nas.id,
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Parse a bandwidth value that may be bits/s ("5000000") or kbps ("5000k"). */
function parseBps(raw: string): number {
  const v = raw.trim().toLowerCase();
  if (v.endsWith("k")) return Math.round(parseFloat(v) * 1000);
  if (v.endsWith("m")) return Math.round(parseFloat(v) * 1_000_000);
  if (v.endsWith("g")) return Math.round(parseFloat(v) * 1_000_000_000);
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Evaluate a FreeRADIUS Login-Time expression (subset):
 *   "Mo0800-2200" | "Mo0800-2200,Tu0800-2200" | "Su" (all day) | "Any0800-1800"
 * Day prefixes: Su Mo Tu We Th Fr Sa + "Any". Multiple comma-separated entries.
 */
export function isWithinLoginTime(expr: string, now: Date): boolean {
  const DAY_MAP: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
  const entries = expr.split(",").map((e) => e.trim()).filter(Boolean);
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  for (const entry of entries) {
    const m = entry.match(/^(any|su|mo|tu|we|th|fr|sa)(\d{4})?-?(\d{4})?$/i);
    if (!m) continue;
    const dayPart = m[1].toLowerCase();
    if (dayPart !== "any" && DAY_MAP[dayPart] !== day) continue;
    if (m[2] === undefined) return true; // whole-day entry (e.g. "Mo")
    const startH = parseInt(m[2].slice(0, 2), 10);
    const startM = parseInt(m[2].slice(2, 4), 10);
    const endH = m[3] ? parseInt(m[3].slice(0, 2), 10) : 23;
    const endM = m[3] ? parseInt(m[3].slice(2, 4), 10) : 59;
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    if (minutes >= start && minutes <= (end === 0 ? 24 * 60 : end)) return true;
  }
  return false;
}
