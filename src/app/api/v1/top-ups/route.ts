// =====================================================================
// TOP-UPS API — list, create (data / time / speed_boost)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
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

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "topup.create",
    module: "billing",
    resource: "TopUp",
    resourceId: topUp.id,
    requestId,
    newValue: {
      subscriberId: topUp.subscriberId,
      type: topUp.type,
      amount: topUp.amount,
      price: topUp.price,
    },
    message: `Created ${topUp.type} top-up for ${subscriber.firstName} ${subscriber.lastName} (${subscriber.customerId})`,
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
    },
    requestId
  );
});
