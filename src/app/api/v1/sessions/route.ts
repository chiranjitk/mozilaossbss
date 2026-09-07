// =====================================================================
// ACTIVE SESSIONS API — list, disconnect (via RADIUS CoA)
// Real-time view of subscribers currently online.
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/sessions — list active sessions
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.session.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const nasId = url.searchParams.get("nasId");

  const where = {
    tenantId: ctx.tenantId,
    status: "active",
    ...(nasId && nasId !== "all" ? { nasId } : {}),
    ...(search
      ? {
          OR: [
            { username: { contains: search } },
            { sessionId: { contains: search } },
            { framedIpAddress: { contains: search } },
            { callingStationId: { contains: search } },
          ],
        }
      : {}),
  };

  const [sessions, total] = await Promise.all([
    db.activeSession.findMany({
      where,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscriber: {
          select: { id: true, customerId: true, firstName: true, lastName: true },
        },
        nas: { select: { id: true, name: true, ipAddress: true, sharedSecret: true, coaPort: true } },
      },
    }),
    db.activeSession.count({ where }),
  ]);

  return paginated(
    sessions.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      subscriberId: s.subscriberId,
      subscriber: s.subscriber
        ? {
            customerId: s.subscriber.customerId,
            name: `${s.subscriber.firstName} ${s.subscriber.lastName}`,
          }
        : null,
      username: s.username,
      nas: {
        id: s.nas.id,
        name: s.nas.name,
        ipAddress: s.nas.ipAddress,
        sharedSecret: s.nas.sharedSecret,
        coaPort: s.nas.coaPort,
      },
      nasIpAddress: s.nasIpAddress,
      framedIpAddress: s.framedIpAddress,
      callingStationId: s.callingStationId,
      calledStationId: s.calledStationId,
      nasPortId: s.nasPortId,
      protocol: s.protocol,
      sessionTimeout: s.sessionTimeout,
      startTime: s.startTime,
      duration: Math.floor((Date.now() - s.startTime.getTime()) / 1000),
      inputOctets: Number(s.inputOctets),
      outputOctets: Number(s.outputOctets),
      totalOctets: Number(s.inputOctets) + Number(s.outputOctets),
    })),
    { page, pageSize, total },
    requestId
  );
});

// POST /api/v1/sessions — disconnect a session via RADIUS CoA
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.session.disconnect");
  const body = await req.json();
  const { sessionId } = body as { sessionId?: string };

  if (!sessionId) {
    throw ApiError.businessRule("sessionId is required");
  }

  const session = await db.activeSession.findFirst({
    where: { sessionId, tenantId: ctx.tenantId, status: "active" },
    include: {
      nas: { select: { id: true, name: true, ipAddress: true, sharedSecret: true, coaPort: true } },
    },
  });
  if (!session) {
    throw ApiError.notFound("Active session", sessionId);
  }

  // Attempt RADIUS CoA Disconnect via the worker's HTTP endpoint
  let disconnectResult: { nasResponded: boolean; method: string } = {
    nasResponded: false,
    method: "local",
  };

  try {
    const workerRes = await fetch("/api/radius-worker/coa-disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nasIp: session.nas.ipAddress,
        coaPort: session.nas.coaPort,
        sharedSecret: session.nas.sharedSecret,
        sessionId: session.sessionId,
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);

    if (workerRes?.ok) {
      const json = await workerRes.json().catch(() => ({}));
      disconnectResult = {
        nasResponded: json.success ?? false,
        method: "radius-coa",
      };
    }
  } catch {
    // Worker not available — local disconnect only
  }

  // Move to history
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
      duration: Math.floor((Date.now() - session.startTime.getTime()) / 1000),
      inputOctets: session.inputOctets,
      outputOctets: session.outputOctets,
      terminationCause: "Admin-Reset",
    },
  });

  // Remove from active sessions
  await db.activeSession.delete({ where: { id: session.id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "session.disconnect",
    module: "aaa",
    resource: "ActiveSession",
    resourceId: session.id,
    requestId,
    newValue: { sessionId: session.sessionId, username: session.username, method: disconnectResult.method, nasResponded: disconnectResult.nasResponded },
    message: `Disconnected session ${session.sessionId} (${session.username}) via ${disconnectResult.method}`,
  });

  await eventBus.emit(
    EVENTS.SESSION_DISCONNECTED,
    {
      sessionId: session.sessionId,
      subscriberId: session.subscriberId,
      username: session.username,
      method: disconnectResult.method,
      nasResponded: disconnectResult.nasResponded,
    },
    { tenantId: ctx.tenantId, source: "aaa", requestId }
  );

  return ok({
    sessionId: session.sessionId,
    username: session.username,
    disconnected: true,
    method: disconnectResult.method,
    nasResponded: disconnectResult.nasResponded,
  });
});
