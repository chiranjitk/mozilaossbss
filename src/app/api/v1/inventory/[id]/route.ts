// =====================================================================
// INVENTORY DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.inventory.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const item = await db.inventoryItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!item) throw ApiError.notFound("Inventory item", id);
  return ok({
    ...item,
    unitCost: item.unitCost.toNumber(),
    unitPrice: item.unitPrice?.toNumber() ?? null,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sku: z.string().max(50).optional().or(z.literal("")),
  category: z.enum(["networking", "cpe", "cable", "accessory", "tool"]).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  unit: z.enum(["unit", "meter", "box", "roll"]).optional(),
  quantity: z.number().int().min(0).optional(),
  minQuantity: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  unitPrice: z.number().min(0).optional(),
  location: z.string().max(100).optional().or(z.literal("")),
  status: z.enum(["in_stock", "low_stock", "out_of_stock", "reserved"]).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.inventory.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.inventoryItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Inventory item", id);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.sku === "") data.sku = null;
  if (data.description === "") data.description = null;
  if (data.location === "") data.location = null;

  // Auto-calculate status if quantity changed and status not explicitly set
  if (data.quantity !== undefined && !data.status) {
    const reorderPoint = data.reorderPoint ?? existing.reorderPoint;
    data.status = data.quantity <= 0 ? "out_of_stock" : data.quantity <= reorderPoint ? "low_stock" : "in_stock";
  }

  const updated = await db.inventoryItem.update({ where: { id }, data });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "inventory.update",
    module: "operations", resource: "InventoryItem", resourceId: id, requestId,
    oldValue: { quantity: existing.quantity, status: existing.status },
    newValue: parsed.data, message: `Updated inventory item ${updated.name} (qty: ${updated.quantity})`,
  });
  return ok({ id: updated.id, name: updated.name, status: updated.status, quantity: updated.quantity });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.inventory.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.inventoryItem.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Inventory item", id);
  await db.inventoryItem.delete({ where: { id } });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "inventory.delete",
    module: "operations", resource: "InventoryItem", resourceId: id, requestId,
    message: `Deleted inventory item ${existing.name}`,
  });
  return ok({ deleted: true, id });
});
