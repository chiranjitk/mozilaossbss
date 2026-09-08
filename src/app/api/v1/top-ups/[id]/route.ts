// =====================================================================
// TOP-UP DETAIL API — PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  type: z.enum(["data", "time", "speed_boost"]).optional(),
  amount: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
  status: z.enum(["active", "used", "expired", "cancelled"]).optional(),
  expiresAt: z.string().datetime().optional().or(z.null()),
});

// PATCH /api/v1/top-ups/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.topUp.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("TopUp", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const updated = await db.topUp.update({
    where: { id },
    data: {
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.expiresAt !== undefined
        ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }
        : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "topup.update",
    module: "billing",
    resource: "TopUp",
    resourceId: id,
    requestId,
    oldValue: {
      type: existing.type,
      amount: existing.amount,
      price: existing.price,
      status: existing.status,
    },
    newValue: data,
    message: `Updated top-up ${id}`,
  });

  return ok({
    id: updated.id,
    type: updated.type,
    amount: updated.amount,
    price: updated.price,
    status: updated.status,
    expiresAt: updated.expiresAt?.toISOString() ?? null,
  });
});

// DELETE /api/v1/top-ups/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.topUp.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("TopUp", id);
  }

  await db.topUp.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "topup.delete",
    module: "billing",
    resource: "TopUp",
    resourceId: id,
    requestId,
    oldValue: { type: existing.type, amount: existing.amount, price: existing.price },
    message: `Deleted top-up ${id}`,
  });

  return ok({ deleted: true, id });
});
