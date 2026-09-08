// =====================================================================
// RESELLER DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/resellers/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.reseller.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const reseller = await db.reseller.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!reseller) {
    throw ApiError.notFound("Reseller", id);
  }

  return ok({
    id: reseller.id,
    name: reseller.name,
    code: reseller.code,
    email: reseller.email,
    phone: reseller.phone,
    address: reseller.address,
    contactPerson: reseller.contactPerson,
    status: reseller.status,
    commissionMethod: reseller.commissionMethod,
    commissionRate: reseller.commissionRate,
    creditLimit: reseller.creditLimit,
    balance: reseller.balance,
    createdAt: reseller.createdAt,
    updatedAt: reseller.updatedAt,
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
  email: z.string().email().max(160).optional().or(z.literal("")).or(z.null()),
  phone: z.string().max(40).optional().or(z.literal("")).or(z.null()),
  address: z.string().max(500).optional().or(z.literal("")).or(z.null()),
  contactPerson: z.string().max(160).optional().or(z.literal("")).or(z.null()),
  status: z.enum(["active", "suspended", "trial"]).optional(),
  commissionMethod: z.enum(["percentage", "flat", "slab"]).optional(),
  commissionRate: z.number().min(0).optional(),
  creditLimit: z.number().min(0).optional(),
  balance: z.number().optional(),
});

// PATCH /api/v1/resellers/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.reseller.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.reseller.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Reseller", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Code uniqueness
  if (data.code && data.code.toUpperCase() !== existing.code) {
    const conflict = await db.reseller.findUnique({
      where: { code: data.code.toUpperCase() },
    });
    if (conflict && conflict.id !== id) {
      throw ApiError.duplicate("Reseller", "code", data.code);
    }
  }

  const updated = await db.reseller.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code.toUpperCase() } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.address !== undefined ? { address: data.address || null } : {}),
      ...(data.contactPerson !== undefined
        ? { contactPerson: data.contactPerson || null }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.commissionMethod !== undefined
        ? { commissionMethod: data.commissionMethod }
        : {}),
      ...(data.commissionRate !== undefined ? { commissionRate: data.commissionRate } : {}),
      ...(data.creditLimit !== undefined ? { creditLimit: data.creditLimit } : {}),
      ...(data.balance !== undefined ? { balance: data.balance } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "reseller.update",
    module: "operations",
    resource: "Reseller",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      code: existing.code,
      commissionMethod: existing.commissionMethod,
      commissionRate: existing.commissionRate,
    },
    newValue: data,
    message: `Updated reseller "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    code: updated.code,
    status: updated.status,
  });
});

// DELETE /api/v1/resellers/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.reseller.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.reseller.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Reseller", id);
  }

  await db.reseller.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "reseller.delete",
    module: "operations",
    resource: "Reseller",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, code: existing.code },
    message: `Deleted reseller "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
