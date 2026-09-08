// =====================================================================
// CHARGE OVERRIDE DETAIL API — PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  type: z.enum(["discount", "surcharge"]).optional(),
  value: z.number().min(0).optional(),
  valueType: z.enum(["percentage", "flat"]).optional(),
  reason: z.string().max(500).optional().or(z.literal("")).or(z.null()),
  status: z.enum(["active", "expired", "cancelled"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional().or(z.null()),
});

// PATCH /api/v1/charge-overrides/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.chargeOverride.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("ChargeOverride", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Sanity: percentage must be 0-100
  const valueType = data.valueType ?? existing.valueType;
  const value = data.value ?? existing.value;
  if (valueType === "percentage" && value > 100) {
    throw ApiError.businessRule("Percentage value cannot exceed 100");
  }

  const updated = await db.chargeOverride.update({
    where: { id },
    data: {
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.value !== undefined ? { value: data.value } : {}),
      ...(data.valueType !== undefined ? { valueType: data.valueType } : {}),
      ...(data.reason !== undefined ? { reason: data.reason || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
      ...(data.endDate !== undefined
        ? { endDate: data.endDate ? new Date(data.endDate) : null }
        : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "charge_override.update",
    module: "billing",
    resource: "ChargeOverride",
    resourceId: id,
    requestId,
    oldValue: {
      type: existing.type,
      value: existing.value,
      valueType: existing.valueType,
      status: existing.status,
    },
    newValue: data,
    message: `Updated charge override ${id}`,
  });

  return ok({
    id: updated.id,
    type: updated.type,
    value: updated.value,
    valueType: updated.valueType,
    status: updated.status,
  });
});

// DELETE /api/v1/charge-overrides/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.chargeOverride.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("ChargeOverride", id);
  }

  await db.chargeOverride.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "charge_override.delete",
    module: "billing",
    resource: "ChargeOverride",
    resourceId: id,
    requestId,
    oldValue: {
      type: existing.type,
      value: existing.value,
      valueType: existing.valueType,
    },
    message: `Deleted charge override ${id}`,
  });

  return ok({ deleted: true, id });
});
