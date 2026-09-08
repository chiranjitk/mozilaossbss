// =====================================================================
// TOP-UPS API — list, create (data / time / speed_boost)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/top-ups
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(type && type !== "all" ? { type } : {}),
  };

  const [rows, total, subscribers] = await Promise.all([
    db.topUp.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.topUp.count({ where }),
    db.subscriber.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, customerId: true, firstName: true, lastName: true },
    }),
  ]);

  if (search) {
    const q = search.toLowerCase();
    const filtered = rows.filter((r) => {
      const sub = subscribers.find((s) => s.id === r.subscriberId);
      const name = sub ? `${sub.firstName} ${sub.lastName}`.toLowerCase() : "";
      const cid = sub?.customerId?.toLowerCase() ?? "";
      return name.includes(q) || cid.includes(q);
    });
    return paginated(
      filtered.map((r) => ({
        id: r.id,
        subscriberId: r.subscriberId,
        type: r.type,
        amount: r.amount,
        price: r.price,
        status: r.status,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        subscriber: subscribers.find((s) => s.id === r.subscriberId),
      })),
      { page, pageSize, total: filtered.length },
      requestId
    );
  }

  return paginated(
    rows.map((r) => ({
      id: r.id,
      subscriberId: r.subscriberId,
      type: r.type,
      amount: r.amount,
      price: r.price,
      status: r.status,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      subscriber: subscribers.find((s) => s.id === r.subscriberId),
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  subscriberId: z.string().min(1, "Subscriber is required"),
  type: z.enum(["data", "time", "speed_boost"]).default("data"),
  amount: z.number().min(0),
  price: z.number().min(0),
  status: z.enum(["active", "used", "expired", "cancelled"]).default("active"),
  expiresAt: z.string().datetime().optional().or(z.null()),
});

// POST /api/v1/top-ups
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Validate subscriber exists
  const subscriber = await db.subscriber.findFirst({
    where: { id: data.subscriberId, tenantId: ctx.tenantId },
    select: { id: true, customerId: true, firstName: true, lastName: true },
  });
  if (!subscriber) {
    throw ApiError.businessRule("Selected subscriber does not exist");
  }

  const topUp = await db.topUp.create({
    data: {
      tenantId: ctx.tenantId,
      subscriberId: data.subscriberId,
      type: data.type,
      amount: data.amount,
      price: data.price,
      status: data.status,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });

  // === INDUSTRY STANDARD: Apply top-up to subscriber's active RADIUS sessions via CoA ===
  // For data top-up: add data quota
  // For speed_boost top-up: send CoA with new Mikrotik-Rate-Limit
  // For time top-up: extend session timeout
  const subscriberFull = await db.subscriber.findFirst({
    where: { id: data.subscriberId, tenantId: ctx.tenantId },
    select: { username: true, planId: true, plan: { select: { downloadSpeed: true, uploadSpeed: true } } },
  });

  if (subscriberFull?.username) {
    // Find active sessions for this subscriber
    const activeSessions = await db.activeSession.findMany({
      where: { subscriberId: data.subscriberId, status: "active" },
      include: { nas: { select: { ipAddress: true, coaPort: true, sharedSecret: true } } },
    });

    for (const session of activeSessions) {
      // Create CoA event record
      const coaType = data.type === "speed_boost" ? "bandwidth_change" : data.type === "time" ? "session_timeout" : "topup_apply";
      let coaAttributes: Record<string, string> = {};

      if (data.type === "speed_boost" && subscriberFull.plan) {
        // Calculate boosted speed (add amount kbps to current plan speed)
        const boostedDown = subscriberFull.plan.downloadSpeed + data.amount;
        const boostedUp = subscriberFull.plan.uploadSpeed + Math.round(data.amount * 0.2);
        const rateLimit = `${boostedDown >= 1000 ? Math.round(boostedDown / 1000) + "M" : boostedDown + "K"}/${boostedUp >= 1000 ? Math.round(boostedUp / 1000) + "M" : boostedUp + "K"}`;
        coaAttributes = { "Mikrotik-Rate-Limit": rateLimit };
      } else if (data.type === "time") {
        coaAttributes = { "Session-Timeout": String(Math.round(data.amount * 3600)) };
      } else if (data.type === "data") {
        // Data top-up: no direct RADIUS attribute, but log it for accounting
        coaAttributes = { "Cryptsk-TopUp-Data": String(data.amount) };
      }

      await db.coaEvent.create({
        data: {
          tenantId: ctx.tenantId,
          type: coaType,
          status: "requested",
          subscriberId: data.subscriberId,
          sessionId: session.sessionId,
          nasIpAddress: session.nas.ipAddress,
          coaPort: session.nas.coaPort,
          attributes: JSON.stringify(coaAttributes),
          requestedBy: ctx.userId,
        },
      });
    }

    // Also sync to radreply for future sessions
    if (data.type === "speed_boost" && subscriberFull.plan) {
      const boostedDown = subscriberFull.plan.downloadSpeed + data.amount;
      const boostedUp = subscriberFull.plan.uploadSpeed + Math.round(data.amount * 0.2);
      const rateLimit = `${boostedDown >= 1000 ? Math.round(boostedDown / 1000) + "M" : boostedDown + "K"}/${boostedUp >= 1000 ? Math.round(boostedUp / 1000) + "M" : boostedUp + "K"}`;
      await db.radReply.create({
        data: { username: subscriberFull.username, attribute: "Mikrotik-Rate-Limit", op: ":=", value: rateLimit },
      });
    }
  }

  // Emit event for billing (top-up purchase generates invoice/payment)
  await eventBus.emit("billing.topup.created", { topUpId: topUp.id, subscriberId: data.subscriberId, price: data.price, type: data.type }, { tenantId: ctx.tenantId, source: "billing", requestId });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "topup.create",
    module: "billing",
    resource: "TopUp",
    resourceId: topUp.id,
    requestId,
    newValue: { subscriberId: topUp.subscriberId, type: topUp.type, amount: topUp.amount, price: topUp.price },
    message: `Created ${topUp.type} top-up for ${subscriber.firstName} ${subscriber.lastName} (${subscriber.customerId}) → CoA sent to ${activeSessions?.length || 0} active session(s)`,
  });

  return created(
    {
      id: topUp.id,
      subscriberId: topUp.subscriberId,
      type: topUp.type,
      amount: topUp.amount,
      price: topUp.price,
      status: topUp.status,
      expiresAt: topUp.expiresAt?.toISOString() ?? null,
      coaSent: true,
      activeSessionsAffected: activeSessions?.length || 0,
    },
    requestId
  );
});
