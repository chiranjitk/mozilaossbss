// =====================================================================
// CHARGE OVERRIDES API — list, create (discount / surcharge per subscriber)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/charge-overrides
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
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
    db.chargeOverride.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.chargeOverride.count({ where }),
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
      const reason = r.reason?.toLowerCase() ?? "";
      return name.includes(q) || cid.includes(q) || reason.includes(q);
    });
    return paginated(
      filtered.map((r) => ({
        id: r.id,
        subscriberId: r.subscriberId,
        type: r.type,
        value: r.value,
        valueType: r.valueType,
        reason: r.reason,
        status: r.status,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate?.toISOString() ?? null,
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
      value: r.value,
      valueType: r.valueType,
      reason: r.reason,
      status: r.status,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      subscriber: subscribers.find((s) => s.id === r.subscriberId),
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  subscriberId: z.string().min(1, "Subscriber is required"),
  type: z.enum(["discount", "surcharge"]).default("discount"),
  value: z.number().min(0),
  valueType: z.enum(["percentage", "flat"]).default("percentage"),
  reason: z.string().max(500).optional().or(z.literal("")),
  status: z.enum(["active", "expired", "cancelled"]).default("active"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional().or(z.null()),
});

// POST /api/v1/charge-overrides
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
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

  // Sanity: percentage must be 0-100
  if (data.valueType === "percentage" && data.value > 100) {
    throw ApiError.businessRule("Percentage value cannot exceed 100");
  }

  const override = await db.chargeOverride.create({
    data: {
      tenantId: ctx.tenantId,
      subscriberId: data.subscriberId,
      type: data.type,
      value: data.value,
      valueType: data.valueType,
      reason: data.reason || null,
      status: data.status,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "charge_override.create",
    module: "billing",
    resource: "ChargeOverride",
    resourceId: override.id,
    requestId,
    newValue: {
      subscriberId: override.subscriberId,
      type: override.type,
      value: override.value,
      valueType: override.valueType,
      reason: override.reason,
    },
    message: `Created ${override.type} (${override.valueType}) of ${override.value} for ${subscriber.firstName} ${subscriber.lastName} (${subscriber.customerId})`,
  });

  return created(
    {
      id: override.id,
      subscriberId: override.subscriberId,
      type: override.type,
      value: override.value,
      valueType: override.valueType,
      status: override.status,
    },
    requestId
  );
});
