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
  if (!userPasswordAttr || !subscriber.passwordHash) {
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

  const passwordValid = await verifyPassword(plainPassword, subscriber.passwordHash);
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

  // 5. Check active session limit (plan.sessionLimit)
  if (subscriber.plan) {
    const activeSessions = await db.activeSession.count({
      where: {
        subscriberId: subscriber.id,
        status: "active",
      },
    });
    if (activeSessions >= subscriber.plan.sessionLimit) {
      console.warn(
        `[radius] Session limit reached for ${username}: ${activeSessions}/${subscriber.plan.sessionLimit}`
      );
      return {
        accept: false,
        attributes: [
          stringAttr(
            Attribute.REPLY_MESSAGE,
            `Session limit reached (${subscriber.plan.sessionLimit}). Disconnect an existing session first.`
          ),
        ],
        username,
        subscriberId: subscriber.id,
        nasId: nas.id,
      };
    }
  }

  // 6. Build authorization attributes
  const attrs: RadiusAttribute[] = [];

  if (subscriber.plan) {
    // Session-Timeout (seconds) — default 86400 (24h) if not specified
    attrs.push(intAttr(Attribute.SESSION_TIMEOUT, 86400));

    // Idle-Timeout — 1800s (30min)
    attrs.push(intAttr(Attribute.IDLE_TIMEOUT, 1800));

    // Bandwidth via Vendor-Specific (MikroTik rate-limit format)
    // We use the Reply-Message for simplicity; real deployments use Vendor-Specific
    if (subscriber.plan.downloadSpeed && subscriber.plan.uploadSpeed) {
      const downKbps = subscriber.plan.downloadSpeed;
      const upKbps = subscriber.plan.uploadSpeed;
      // MikroTik Rate-Limit format: "down/up burst-threshold burst-limit burst-time priority"
      attrs.push(
        stringAttr(Attribute.REPLY_MESSAGE, `${downKbps}/${upKbps}`)
      );
    }
  }

  // Framed-Protocol = PPP (7 -> value 1)
  attrs.push(intAttr(Attribute.FRAMED_PROTOCOL, 1));

  // Service-Type = Framed-User (6 -> value 2)
  attrs.push(intAttr(Attribute.SERVICE_TYPE, 2));

  console.log(
    `[radius] ACCEPT ${username} from ${nasIp} (subscriber ${subscriber.customerId})`
  );

  return {
    accept: true,
    attributes: attrs,
    subscriberId: subscriber.id,
    username,
    nasId: nas.id,
  };
}
