// =====================================================================
// GRACE PERIODS API — list, create (pre/post billing grace windows)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/grace-periods
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
    db.gracePeriod.findMany({
      where,
      orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.gracePeriod.count({ where }),
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
        tenantId: r.tenantId,
        subscriberId: r.subscriberId,
        type: r.type,
        status: r.status,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        days: r.days,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        subscriber: subscribers.find((s) => s.id === r.subscriberId),
      })),
      { page, pageSize, total: filtered.length },
      requestId
    );
  }

  return paginated(
    rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      subscriberId: r.subscriberId,
      type: r.type,
      status: r.status,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      days: r.days,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      subscriber: subscribers.find((s) => s.id === r.subscriberId),
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  subscriberId: z.string().min(1, "Subscriber is required"),
  type: z.enum(["pre_billing", "post_billing"]).default("post_billing"),
  status: z.enum(["active", "suspended", "cancelled", "expired"]).default("active"),
  days: z.number().int().min(1).max(365),
  startDate: z.string().datetime(),
});

// POST /api/v1/grace-periods
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

  const start = new Date(data.startDate);
  const end = new Date(start.getTime() + data.days * 24 * 60 * 60 * 1000);

  const grace = await db.gracePeriod.create({
    data: {
      tenantId: ctx.tenantId,
      subscriberId: data.subscriberId,
      type: data.type,
      status: data.status,
      startDate: start,
      endDate: end,
      days: data.days,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "grace_period.create",
    module: "billing",
    resource: "GracePeriod",
    resourceId: grace.id,
    requestId,
    newValue: {
      subscriberId: grace.subscriberId,
      type: grace.type,
      days: grace.days,
      startDate: grace.startDate,
      endDate: grace.endDate,
    },
    message: `Created ${grace.type} grace period for ${subscriber.firstName} ${subscriber.lastName} (${subscriber.customerId})`,
  });

  return created(
    {
      id: grace.id,
      subscriberId: grace.subscriberId,
      type: grace.type,
      status: grace.status,
      days: grace.days,
      startDate: grace.startDate.toISOString(),
      endDate: grace.endDate.toISOString(),
    },
    requestId
  );
});
