// =====================================================================
// POLICY ENFORCEMENT — CoA dispatcher
// Takes an evaluated EffectivePolicy and pushes it to the subscriber's
// active RADIUS sessions via Change-of-Authorization (CoA) requests.
//
// In production this would build a real RADIUS CoA packet (RFC 3576)
// and UDP-send it to the NAS on port 3799. In the sandbox we record a
// CoAEvent with the exact attributes so the radius-worker can replay
// them when wired to a real NAS.
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { eventBus } from "@/core/events/bus";
import {
  type EffectivePolicy,
  formatMikrotikRateLimit,
} from "./engine";

export interface CoaDispatchResult {
  dispatched: number;
  coaEventIds: string[];
  attributes: Record<string, string>;
  errors: Array<{ sessionId: string; error: string }>;
}

/**
 * Enforce an effective policy on a subscriber's active sessions.
 * Builds the CoA attribute set and writes a CoAEvent per session.
 */
export async function enforcePolicy(
  tenantId: string,
  policy: EffectivePolicy,
  actorUserId: string,
  requestId?: string
): Promise<CoaDispatchResult> {
  // Build the CoA attribute set from the evaluated policy
  const attributes = buildCoaAttributes(policy);

  // Find all active sessions for this subscriber
  const sessions = await db.activeSession.findMany({
    where: { tenantId, subscriberId: policy.subscriberId, status: "active" },
    include: { nas: { select: { id: true, ipAddress: true, coaPort: true, sharedSecret: true } } },
  });

  const coaEventIds: string[] = [];
  const errors: Array<{ sessionId: string; error: string }> = [];

  for (const session of sessions) {
    try {
      const coaEvent = await db.coaEvent.create({
        data: {
          tenantId,
          type:
            policy.enforcement === "block"
              ? "session_disconnect"
              : "session_coa",
          status: "requested",
          subscriberId: policy.subscriberId,
          sessionId: session.sessionId,
          nasIpAddress: session.nas.ipAddress,
          coaPort: session.nas.coaPort,
          attributes: JSON.stringify(attributes),
          requestedBy: actorUserId,
        },
      });
      coaEventIds.push(coaEvent.id);

      // If hard-blocked, also mark the session for disconnect
      if (policy.enforcement === "block") {
        await db.activeSession.update({
          where: { id: session.id },
          data: { status: "disconnected" },
        });
      }
    } catch (err) {
      errors.push({
        sessionId: session.sessionId,
        error: err instanceof Error ? err.message : "Unknown CoA error",
      });
    }
  }

  // Emit a session.coa event so the radius-worker picks it up
  await eventBus.emit(
    "session.coa",
    {
      subscriberId: policy.subscriberId,
      enforcement: policy.enforcement,
      sessionCount: sessions.length,
      attributes,
      coaEventIds,
    },
    { tenantId, source: "policy", requestId }
  );

  return {
    dispatched: coaEventIds.length,
    coaEventIds,
    attributes,
    errors,
  };
}

/**
 * Build the RADIUS CoA attribute dictionary from an EffectivePolicy.
 * These are the attributes a NAS would apply to re-shape the live session.
 */
function buildCoaAttributes(policy: EffectivePolicy): Record<string, string> {
  const attrs: Record<string, string> = {};

  if (policy.enforcement === "block") {
    // Disconnect: RFC 3576 Disconnect-Message
    attrs["Acct-Status-Type"] = "Disconnect-Request";
    return attrs;
  }

  // Rate limit — Mikrotik + WISPr (both, for vendor compatibility)
  attrs["Mikrotik-Rate-Limit"] = formatMikrotikRateLimit(policy.rateLimit);
  attrs["WISPr-Bandwidth-Max-Down"] = String(policy.rateLimit.downloadKbps);
  attrs["WISPr-Bandwidth-Max-Up"] = String(policy.rateLimit.uploadKbps);

  // QoS — DSCP marking + priority
  if (policy.qos.dscp !== undefined && policy.qos.dscp !== null) {
    attrs["Cryptsk-QoS-DSCP"] = String(policy.qos.dscp);
  }
  if (policy.qos.priority) {
    attrs["Cryptsk-QoS-Priority"] = String(policy.qos.priority);
  }
  if (policy.qos.ceilKbps) {
    attrs["Cryptsk-QoS-Ceil"] = String(policy.qos.ceilKbps);
  }

  // Session limits
  attrs["Session-Timeout"] = "86400"; // 24h hard cap
  attrs["Idle-Timeout"] = "1800"; // 30 min idle

  // FUP marker (so the NAS can log/bill the throttled state differently)
  if (policy.enforcement === "throttle") {
    attrs["Cryptsk-FUP-Throttled"] = "1";
  }

  return attrs;
}

/**
 * Bulk-evaluate and enforce policy for ALL active subscribers in a tenant.
 * Used by the nightly policy-reconciliation cron.
 */
export async function reconcileAllPolicies(
  tenantId: string,
  actorUserId: string,
  requestId?: string
): Promise<{
  evaluated: number;
  enforced: number;
  blocked: number;
  throttled: number;
  errors: string[];
}> {
  const subscribers = await db.subscriber.findMany({
    where: { tenantId, status: { in: ["active", "suspended"] } },
    select: { id: true },
  });

  const errors: string[] = [];
  let enforced = 0;
  let blocked = 0;
  let throttled = 0;

  // Re-import here to avoid a circular dependency at module load time
  const { evaluateSubscriberPolicy } = await import("./engine");

  for (const sub of subscribers) {
    try {
      const policy = await evaluateSubscriberPolicy(tenantId, sub.id);
      if (policy.enforcement !== "allow") {
        await enforcePolicy(tenantId, policy, actorUserId, requestId);
        enforced++;
        if (policy.enforcement === "block") blocked++;
        if (policy.enforcement === "throttle") throttled++;
      }
    } catch (err) {
      errors.push(
        `Subscriber ${sub.id}: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  return {
    evaluated: subscribers.length,
    enforced,
    blocked,
    throttled,
    errors,
  };
}
