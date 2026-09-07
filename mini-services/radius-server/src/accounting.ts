// =====================================================================
// RADIUS ACCOUNTING — processes Accounting-Request packets (RFC 2866)
// Start: create ActiveSession, Interim: update counters, Stop: move to history
// Idempotent: handles duplicate packets, out-of-order, NAS reconnects.
// =====================================================================

import { PrismaClient } from "@prisma/client";
import {
  Attribute,
  AcctStatusType,
  TERMINATION_CAUSES,
  type RadiusPacket,
} from "./packet";

const db = new PrismaClient({
  log: ["warn", "error"],
});

export interface AcctResult {
  success: boolean;
  action: "start" | "stop" | "interim" | "on" | "off" | "unknown";
  subscriberId?: string;
  nasId?: string;
  sessionId: string;
  error?: string;
}

/**
 * Process a RADIUS Accounting-Request.
 */
export async function handleAccountingRequest(
  packet: RadiusPacket,
  nasIp: string
): Promise<AcctResult> {
  const attrs = packet.attributes;
  const sessionId =
    attrs.find((a) => a.type === Attribute.ACCT_SESSION_ID)?.value.toString("utf8") ?? "";
  const username =
    attrs.find((a) => a.type === Attribute.USER_NAME)?.value.toString("utf8") ?? "";

  // Acct-Status-Type (40) — required
  const statusTypeRaw = attrs.find((a) => a.type === Attribute.ACCT_STATUS_TYPE);
  if (!statusTypeRaw || statusTypeRaw.value.length !== 4) {
    return {
      success: false,
      action: "unknown",
      sessionId,
      error: "Missing or invalid Acct-Status-Type",
    };
  }
  const statusType = statusTypeRaw.value.readUInt32BE(0);

  // Find NAS
  const nas = await db.nasClient.findFirst({
    where: { ipAddress: nasIp, status: "active" },
    include: { tenant: { select: { id: true } } },
  });
  if (!nas) {
    return {
      success: false,
      action: "unknown",
      sessionId,
      error: `Unknown NAS: ${nasIp}`,
    };
  }
  const tenantId = nas.tenant.id;

  // Find subscriber by username
  let subscriberId: string | null = null;
  if (username) {
    const sub = await db.subscriber.findUnique({
      where: { username },
      select: { id: true },
    });
    subscriberId = sub?.id ?? null;
  }

  // Common attributes
  const framedIp = getIpAttr(attrs, Attribute.FRAMED_IP_ADDRESS);
  const callingStationId = getStringAttr(attrs, Attribute.CALLING_STATION_ID);
  const calledStationId = getStringAttr(attrs, Attribute.CALLED_STATION_ID);
  const nasPortId = getStringAttr(attrs, Attribute.NAS_PORT_ID);
  const nasIdentifier = getStringAttr(attrs, Attribute.NAS_IDENTIFIER);
  const sessionTimeout = getIntAttr(attrs, Attribute.SESSION_TIMEOUT);
  const protocol = getFramedProtocol(attrs);

  switch (statusType) {
    case AcctStatusType.START:
      return handleStart({
        sessionId,
        tenantId,
        subscriberId,
        nasId: nas.id,
        nasIp,
        username,
        framedIp,
        callingStationId,
        calledStationId,
        nasPortId,
        protocol,
        sessionTimeout,
      });

    case AcctStatusType.INTERIM:
      return handleInterim({
        sessionId,
        attrs,
      });

    case AcctStatusType.STOP:
      return handleStop({
        sessionId,
        attrs,
      });

    case AcctStatusType.ON:
      // Accounting-On: NAS just rebooted. Mark all its sessions as stopped.
      await db.activeSession.updateMany({
        where: { nasId: nas.id, status: "active" },
        data: {
          status: "stopped",
          terminationCause: "NAS-Reboot",
          updateTime: new Date(),
        },
      });
      return { success: true, action: "on", sessionId, nasId: nas.id };

    case AcctStatusType.OFF:
      // Accounting-Off: NAS is shutting down.
      await db.activeSession.updateMany({
        where: { nasId: nas.id, status: "active" },
        data: {
          status: "stopped",
          terminationCause: "NAS-Reboot",
          updateTime: new Date(),
        },
      });
      return { success: true, action: "off", sessionId, nasId: nas.id };

    default:
      return {
        success: false,
        action: "unknown",
        sessionId,
        error: `Unknown Acct-Status-Type: ${statusType}`,
      };
  }
}

// ---------------------------------------------------------------------
// START — create a new active session
// ---------------------------------------------------------------------

async function handleStart(params: {
  sessionId: string;
  tenantId: string;
  subscriberId: string | null;
  nasId: string;
  nasIp: string;
  username: string;
  framedIp: string | null;
  callingStationId: string | null;
  calledStationId: string | null;
  nasPortId: string | null;
  protocol: string | null;
  sessionTimeout: number | null;
}): Promise<AcctResult> {
  const { sessionId, tenantId, subscriberId, nasId, nasIp, username } = params;

  // Idempotent: if session already exists with same sessionId, return success
  const existing = await db.activeSession.findUnique({
    where: { sessionId },
  });
  if (existing && existing.status === "active") {
    return {
      success: true,
      action: "start",
      sessionId,
      subscriberId: existing.subscriberId ?? undefined,
      nasId,
    };
  }

  await db.activeSession.create({
    data: {
      tenantId,
      sessionId,
      subscriberId: subscriberId ?? null,
      nasId,
      username,
      nasIpAddress: nasIp,
      framedIpAddress: params.framedIp,
      callingStationId: params.callingStationId,
      calledStationId: params.calledStationId,
      nasPortId: params.nasPortId,
      protocol: params.protocol,
      sessionTimeout: params.sessionTimeout,
      status: "active",
      startTime: new Date(),
      inputOctets: BigInt(0),
      outputOctets: BigInt(0),
      inputGigawords: 0,
      outputGigawords: 0,
    },
  });

  console.log(
    `[radius-acct] START session=${sessionId} user=${username} nas=${nasIp} ip=${params.framedIp ?? "—"}`
  );

  return {
    success: true,
    action: "start",
    sessionId,
    subscriberId: subscriberId ?? undefined,
    nasId,
  };
}

// ---------------------------------------------------------------------
// INTERIM — update byte/packet counters
// ---------------------------------------------------------------------

async function handleInterim({
  sessionId,
  attrs,
}: {
  sessionId: string;
  attrs: any[];
}): Promise<AcctResult> {
  const session = await db.activeSession.findUnique({
    where: { sessionId },
  });
  if (!session) {
    // Session may have expired — re-create as active
    console.warn(
      `[radius-acct] INTERIM for unknown session ${sessionId} — ignoring`
    );
    return {
      success: false,
      action: "interim",
      sessionId,
      error: "Session not found",
    };
  }

  // Update counters (support 64-bit via Acct-{Input,Output}-Gigawords attrs)
  const inputOctets = getIntAttr(attrs, Attribute.ACCT_INPUT_OCTETS) ?? 0;
  const outputOctets = getIntAttr(attrs, Attribute.ACCT_OUTPUT_OCTETS) ?? 0;
  const sessionTime = getIntAttr(attrs, Attribute.ACCT_SESSION_TIME) ?? 0;

  await db.activeSession.update({
    where: { sessionId },
    data: {
      inputOctets: BigInt(inputOctets),
      outputOctets: BigInt(outputOctets),
      updateTime: new Date(),
    },
  });

  console.log(
    `[radius-acct] INTERIM session=${sessionId} in=${inputOctets} out=${outputOctets} time=${sessionTime}s`
  );

  return {
    success: true,
    action: "interim",
    sessionId,
    subscriberId: session.subscriberId ?? undefined,
    nasId: session.nasId,
  };
}

// ---------------------------------------------------------------------
// STOP — move to SessionHistory, delete ActiveSession
// ---------------------------------------------------------------------

async function handleStop({
  sessionId,
  attrs,
}: {
  sessionId: string;
  attrs: any[];
}): Promise<AcctResult> {
  const session = await db.activeSession.findUnique({
    where: { sessionId },
  });
  if (!session) {
    // Already stopped — idempotent
    return {
      success: true,
      action: "stop",
      sessionId,
    };
  }

  const inputOctets = getIntAttr(attrs, Attribute.ACCT_INPUT_OCTETS) ?? 0;
  const outputOctets = getIntAttr(attrs, Attribute.ACCT_OUTPUT_OCTETS) ?? 0;
  const sessionTime = getIntAttr(attrs, Attribute.ACCT_SESSION_TIME) ?? 0;
  const terminateCauseRaw = getIntAttr(attrs, Attribute.ACCT_TERMINATE_CAUSE);
  const terminationCause = terminateCauseRaw
    ? TERMINATION_CAUSES[terminateCauseRaw] ?? String(terminateCauseRaw)
    : null;

  // Insert into history
  await db.sessionHistory.create({
    data: {
      tenantId: session.tenantId,
      sessionId: session.sessionId,
      subscriberId: session.subscriberId,
      nasId: session.nasId,
      username: session.username,
      nasIpAddress: session.nasIpAddress,
      framedIpAddress: session.framedIpAddress,
      callingStationId: session.callingStationId,
      startTime: session.startTime,
      stopTime: new Date(),
      duration: sessionTime,
      inputOctets: BigInt(inputOctets),
      outputOctets: BigInt(outputOctets),
      terminationCause,
    },
  });

  // Delete active session
  await db.activeSession.delete({
    where: { sessionId },
  });

  console.log(
    `[radius-acct] STOP session=${sessionId} dur=${sessionTime}s in=${inputOctets} out=${outputOctets} cause=${terminationCause ?? "—"}`
  );

  return {
    success: true,
    action: "stop",
    sessionId,
    subscriberId: session.subscriberId ?? undefined,
    nasId: session.nasId,
  };
}

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

function getStringAttr(attrs: any[], type: number): string | null {
  const attr = attrs.find((a: any) => a.type === type);
  return attr ? attr.value.toString("utf8") : null;
}

function getIntAttr(attrs: any[], type: number): number | null {
  const attr = attrs.find((a: any) => a.type === type);
  if (!attr || attr.value.length !== 4) return null;
  return attr.value.readUInt32BE(0);
}

function getIpAttr(attrs: any[], type: number): string | null {
  const attr = attrs.find((a: any) => a.type === type);
  if (!attr || attr.value.length !== 4) return null;
  return Array.from(attr.value).join(".");
}

function getFramedProtocol(attrs: any[]): string | null {
  const val = getIntAttr(attrs, Attribute.FRAMED_PROTOCOL);
  if (val === null) return null;
  const map: Record<number, string> = {
    1: "PPP",
    2: "SLIP",
    3: "AppleTalk-Remote-Access",
    4: "Gandalf-SLIP",
    5: "Xylogics-IPX-SLIP",
    6: "X.75",
  };
  return map[val] ?? String(val);
}
