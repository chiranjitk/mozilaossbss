// =====================================================================
// GRACE PERIOD DETAIL API — PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  type: z.enum(["pre_billing", "post_billing"]).optional(),
  status: z.enum(["active", "suspended", "cancelled", "expired"]).optional(),
  days: z.number().int().min(1).max(365).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// PATCH /api/v1/grace-periods/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.gracePeriod.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("GracePeriod", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // If days changed and no explicit endDate supplied, recompute endDate from startDate + days
  let newEndDate: Date | undefined;
  if (data.endDate) {
    newEndDate = new Date(data.endDate);
  } else if (data.days && data.days !== existing.days) {
    const start = data.startDate ? new Date(data.startDate) : existing.startDate;
    newEndDate = new Date(start.getTime() + data.days * 24 * 60 * 60 * 1000);
  }

  const updated = await db.gracePeriod.update({
    where: { id },
    data: {
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.days !== undefined ? { days: data.days } : {}),
      ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
      ...(newEndDate ? { endDate: newEndDate } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "grace_period.update",
    module: "billing",
    resource: "GracePeriod",
    resourceId: id,
    requestId,
    oldValue: {
      type: existing.type,
      status: existing.status,
      days: existing.days,
      startDate: existing.startDate,
      endDate: existing.endDate,
    },
    newValue: data,
    message: `Updated grace period ${id}`,
  });

  return ok({
    id: updated.id,
    type: updated.type,
    status: updated.status,
    days: updated.days,
    startDate: updated.startDate.toISOString(),
    endDate: updated.endDate.toISOString(),
  });
});

// DELETE /api/v1/grace-periods/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.gracePeriod.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("GracePeriod", id);
  }

  await db.gracePeriod.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "grace_period.delete",
    module: "billing",
    resource: "GracePeriod",
    resourceId: id,
    requestId,
    oldValue: {
      type: existing.type,
      status: existing.status,
      days: existing.days,
    },
    message: `Deleted grace period ${id}`,
  });

  return ok({ deleted: true, id });
});
