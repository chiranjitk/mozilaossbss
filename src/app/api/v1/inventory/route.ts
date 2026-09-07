// =====================================================================
// INVENTORY API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.inventory.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(category && category !== "all" ? { category } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }] } : {}),
  };

  const [items, total] = await Promise.all([
    db.inventoryItem.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.inventoryItem.count({ where }),
  ]);

  return paginated(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      category: i.category,
      description: i.description,
      unit: i.unit,
      quantity: i.quantity,
      minQuantity: i.minQuantity,
      reorderPoint: i.reorderPoint,
      unitCost: i.unitCost.toNumber(),
      unitPrice: i.unitPrice?.toNumber() ?? null,
      location: i.location,
      status: i.status,
      needsReorder: i.quantity <= i.reorderPoint,
      stockValue: i.unitCost.toNumber() * i.quantity,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  sku: z.string().max(50).optional().or(z.literal("")),
  category: z.enum(["networking", "cpe", "cable", "accessory", "tool"]).default("networking"),
  description: z.string().max(500).optional().or(z.literal("")),
  unit: z.enum(["unit", "meter", "box", "roll"]).default("unit"),
  quantity: z.number().int().min(0).default(0),
  minQuantity: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(5),
  unitCost: z.number().min(0),
  unitPrice: z.number().min(0).optional(),
  location: z.string().max(100).optional().or(z.literal("")),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.inventory.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  data.sku = data.sku || null;
  data.description = data.description || null;
  data.unitPrice = data.unitPrice || null;
  data.location = data.location || null;
  // Auto-calculate status
  data.status = data.quantity <= 0 ? "out_of_stock" : data.quantity <= data.reorderPoint ? "low_stock" : "in_stock";

  const item = await db.inventoryItem.create({ data: { tenantId: ctx.tenantId, ...data } });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "inventory.create",
    module: "operations", resource: "InventoryItem", resourceId: item.id, requestId,
    message: `Created inventory item ${item.name} (${item.quantity} ${item.unit})`,
  });
  return created({ id: item.id, name: item.name, status: item.status }, requestId);
});
