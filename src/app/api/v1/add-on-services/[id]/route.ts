// =====================================================================
// ADD-ON SERVICE DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/add-on-services/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const svc = await db.addOnService.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!svc) {
    throw ApiError.notFound("AddOnService", id);
  }

  return ok({
    id: svc.id,
    name: svc.name,
    description: svc.description,
    chargeType: svc.chargeType,
    price: svc.price,
    status: svc.status,
    createdAt: svc.createdAt.toISOString(),
    updatedAt: svc.updatedAt.toISOString(),
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).optional().or(z.literal("")).or(z.null()),
  chargeType: z.enum(["flat", "per_day", "per_gb", "per_month"]).optional(),
  price: z.number().min(0).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

// PATCH /api/v1/add-on-services/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.addOnService.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("AddOnService", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Name uniqueness check
  if (data.name && data.name !== existing.name) {
    const conflict = await db.addOnService.findFirst({
      where: { tenantId: ctx.tenantId, name: data.name },
    });
    if (conflict && conflict.id !== id) {
      throw ApiError.duplicate("Add-on service", "name", data.name);
    }
  }

  const updated = await db.addOnService.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.chargeType !== undefined ? { chargeType: data.chargeType } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "addon_service.update",
    module: "billing",
    resource: "AddOnService",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      chargeType: existing.chargeType,
      price: existing.price,
    },
    newValue: data,
    message: `Updated add-on service "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    chargeType: updated.chargeType,
    price: updated.price,
    status: updated.status,
  });
});

// DELETE /api/v1/add-on-services/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.addOnService.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("AddOnService", id);
  }

  await db.addOnService.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "addon_service.delete",
    module: "billing",
    resource: "AddOnService",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, chargeType: existing.chargeType },
    message: `Deleted add-on service "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
