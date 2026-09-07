// =====================================================================
// PLAN DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";

export const dynamic = "force-dynamic";

// GET /api/v1/plans/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const plan = await db.plan.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { _count: { select: { subscribers: true } } },
  });
  if (!plan) {
    throw ApiError.notFound("Plan", id);
  }

  return ok({
    id: plan.id,
    name: plan.name,
    code: plan.code,
    description: plan.description,
    price: plan.price.toNumber(),
    currency: plan.currency,
    billingCycle: plan.billingCycle,
    downloadSpeed: plan.downloadSpeed,
    uploadSpeed: plan.uploadSpeed,
    dataCap: plan.dataCap,
    sessionLimit: plan.sessionLimit,
    taxRate: plan.taxRate.toNumber(),
    status: plan.status,
    subscriberCount: plan._count.subscribers,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  });
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().min(0).optional(),
  currency: z.string().optional(),
  billingCycle: z.enum(["monthly", "quarterly", "yearly", "one_time", "weekly"]).optional(),
  downloadSpeed: z.number().int().min(0).nullable().optional(),
  uploadSpeed: z.number().int().min(0).nullable().optional(),
  dataCap: z.number().int().min(0).nullable().optional(),
  sessionLimit: z.number().int().min(1).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

// PATCH /api/v1/plans/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.create");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.plan.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) {
    throw ApiError.notFound("Plan", id);
  }

  const body = await req.json();
  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  const updated = await db.plan.update({
    where: { id },
    data: parsed.data,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "plan.update",
    module: "subscribers",
    resource: "Plan",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      price: existing.price.toNumber(),
      billingCycle: existing.billingCycle,
    },
    newValue: parsed.data,
    message: `Updated plan ${updated.name}`,
  });

  if (parsed.data.price !== undefined && parsed.data.price !== existing.price.toNumber()) {
    await eventBus.emit(
      EVENTS.PLAN_PRICING_CHANGED,
      { planId: id, oldPrice: existing.price.toNumber(), newPrice: parsed.data.price },
      { tenantId: ctx.tenantId, source: "subscribers", requestId }
    );
  }

  return ok({
    id: updated.id,
    name: updated.name,
    code: updated.code,
    price: updated.price.toNumber(),
    status: updated.status,
  });
});

// DELETE /api/v1/plans/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.create");
  const id = new URL(req.url).pathname.split("/")[4];

  const plan = await db.plan.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { _count: { select: { subscribers: true } } },
  });
  if (!plan) {
    throw ApiError.notFound("Plan", id);
  }

  if (plan._count.subscribers > 0) {
    throw ApiError.businessRule(
      `Cannot delete plan with ${plan._count.subscribers} assigned subscriber(s). Reassign them first.`
    );
  }

  await db.plan.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "plan.delete",
    module: "subscribers",
    resource: "Plan",
    resourceId: id,
    requestId,
    oldValue: { name: plan.name, code: plan.code },
    message: `Deleted plan ${plan.name}`,
  });

  return ok({ deleted: true, id });
});
