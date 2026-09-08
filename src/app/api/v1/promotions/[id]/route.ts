// =====================================================================
// PROMOTION DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/promotions/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const promotion = await db.promotion.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!promotion) {
    throw ApiError.notFound("Promotion", id);
  }

  return ok({
    id: promotion.id,
    name: promotion.name,
    code: promotion.code,
    description: promotion.description,
    type: promotion.type,
    value: promotion.value,
    maxUses: promotion.maxUses,
    usedCount: promotion.usedCount,
    validFrom: promotion.validFrom,
    validUntil: promotion.validUntil,
    status: promotion.status,
    applicablePlans: promotion.applicablePlans,
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  code: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_-]+$/i, "Code must be alphanumeric, dash, or underscore")
    .optional(),
  description: z.string().max(1000).optional().or(z.literal("")).or(z.null()),
  type: z.enum(["percentage", "flat", "free_trial"]).optional(),
  value: z.number().min(0).optional(),
  maxUses: z.number().int().min(1).optional().or(z.null()),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  status: z.enum(["active", "expired", "depleted"]).optional(),
  applicablePlans: z.string().max(2000).optional().or(z.literal("")).or(z.null()),
});

// PATCH /api/v1/promotions/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.promotion.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Promotion", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Code uniqueness check on change
  if (data.code && data.code.toUpperCase() !== existing.code) {
    const conflict = await db.promotion.findUnique({
      where: { code: data.code.toUpperCase() },
    });
    if (conflict && conflict.id !== id) {
      throw ApiError.duplicate("Promotion", "code", data.code);
    }
  }

  const updated = await db.promotion.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code.toUpperCase() } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.value !== undefined ? { value: data.value } : {}),
      ...(data.maxUses !== undefined ? { maxUses: data.maxUses } : {}),
      ...(data.validFrom !== undefined ? { validFrom: new Date(data.validFrom) } : {}),
      ...(data.validUntil !== undefined ? { validUntil: new Date(data.validUntil) } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.applicablePlans !== undefined
        ? { applicablePlans: data.applicablePlans || null }
        : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "promotion.update",
    module: "billing",
    resource: "Promotion",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      code: existing.code,
      type: existing.type,
      value: existing.value,
    },
    newValue: data,
    message: `Updated promotion "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    code: updated.code,
    status: updated.status,
  });
});

// DELETE /api/v1/promotions/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.promotion.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Promotion", id);
  }

  await db.promotion.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "promotion.delete",
    module: "billing",
    resource: "Promotion",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, code: existing.code },
    message: `Deleted promotion "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
