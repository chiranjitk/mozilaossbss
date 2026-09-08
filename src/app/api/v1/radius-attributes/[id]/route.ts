// =====================================================================
// RADIUS ATTRIBUTE DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

function idFromReq(req: NextRequest): string {
  return new URL(req.url).pathname.split("/")[4];
}

// GET /api/v1/radius-attributes/[id]
export const GET = apiRoute(async (req: NextRequest) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const id = idFromReq(req);

  const attr = await db.radiusAttributeDef.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!attr) {
    throw ApiError.notFound("RadiusAttributeDef", id);
  }

  return ok({
    id: attr.id,
    name: attr.name,
    type: attr.type,
    vendor: attr.vendor,
    attrType: attr.attrType,
    description: attr.description,
    createdAt: attr.createdAt,
    updatedAt: attr.updatedAt,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["string", "integer", "ipaddr", "octets"]).optional(),
  vendor: z.string().max(120).optional().or(z.literal("")).or(z.null()),
  attrType: z.enum(["check", "reply", "both"]).optional(),
  description: z.string().max(500).optional().or(z.literal("")).or(z.null()),
});

// PATCH /api/v1/radius-attributes/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = idFromReq(req);

  const existing = await db.radiusAttributeDef.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("RadiusAttributeDef", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  if (data.name && data.name !== existing.name) {
    const conflict = await db.radiusAttributeDef.findFirst({
      where: { name: data.name, NOT: { id } },
    });
    if (conflict) {
      throw ApiError.duplicate("RADIUS Attribute", "name", data.name);
    }
  }

  const updated = await db.radiusAttributeDef.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.vendor !== undefined ? { vendor: data.vendor || null } : {}),
      ...(data.attrType !== undefined ? { attrType: data.attrType } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_attribute.update",
    module: "aaa",
    resource: "RadiusAttributeDef",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      type: existing.type,
      vendor: existing.vendor,
      attrType: existing.attrType,
    },
    newValue: data,
    message: `Updated RADIUS attribute "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    type: updated.type,
    attrType: updated.attrType,
  });
});

// DELETE /api/v1/radius-attributes/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = idFromReq(req);

  const existing = await db.radiusAttributeDef.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("RadiusAttributeDef", id);
  }

  await db.radiusAttributeDef.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_attribute.delete",
    module: "aaa",
    resource: "RadiusAttributeDef",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, type: existing.type, vendor: existing.vendor },
    message: `Deleted RADIUS attribute "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
