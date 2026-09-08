// =====================================================================
// AREA DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/areas/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.network.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const area = await db.area.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!area) {
    throw ApiError.notFound("Area", id);
  }

  return ok({
    id: area.id,
    name: area.name,
    description: area.description,
    pincode: area.pincode,
    city: area.city,
    state: area.state,
    latitude: area.latitude,
    longitude: area.longitude,
    status: area.status,
    sortOrder: area.sortOrder,
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().or(z.literal("")).or(z.null()),
  pincode: z.string().max(20).optional().or(z.literal("")).or(z.null()),
  city: z.string().max(120).optional().or(z.literal("")).or(z.null()),
  state: z.string().max(120).optional().or(z.literal("")).or(z.null()),
  latitude: z.number().min(-90).max(90).optional().or(z.null()),
  longitude: z.number().min(-180).max(180).optional().or(z.null()),
  status: z.enum(["active", "disabled"]).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// PATCH /api/v1/areas/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.network.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.area.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) {
    throw ApiError.notFound("Area", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Uniqueness check on name change
  if (data.name && data.name !== existing.name) {
    const conflict = await db.area.findFirst({
      where: { tenantId: ctx.tenantId, name: data.name, NOT: { id } },
    });
    if (conflict) {
      throw ApiError.duplicate("Area", "name", data.name);
    }
  }

  const updated = await db.area.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.pincode !== undefined ? { pincode: data.pincode || null } : {}),
      ...(data.city !== undefined ? { city: data.city || null } : {}),
      ...(data.state !== undefined ? { state: data.state || null } : {}),
      ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
      ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "area.update",
    module: "network",
    resource: "Area",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      status: existing.status,
      city: existing.city,
    },
    newValue: data,
    message: `Updated area "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    status: updated.status,
  });
});

// DELETE /api/v1/areas/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.network.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.area.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) {
    throw ApiError.notFound("Area", id);
  }

  await db.area.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "area.delete",
    module: "network",
    resource: "Area",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, city: existing.city },
    message: `Deleted area "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
