// =====================================================================
// RADIUS ATTRIBUTES API — list, create
// Catalog of standard/vendor RADIUS attribute definitions
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/radius-attributes
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const type = url.searchParams.get("type");
  const vendor = url.searchParams.get("vendor");
  const attrType = url.searchParams.get("attrType");

  const where = {
    tenantId: ctx.tenantId,
    ...(type && type !== "all" ? { type } : {}),
    ...(vendor && vendor !== "all" ? { vendor } : {}),
    ...(attrType && attrType !== "all" ? { attrType } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
            { vendor: { contains: search } },
          ],
        }
      : {}),
  };

  const [attrs, total] = await Promise.all([
    db.radiusAttributeDef.findMany({
      where,
      orderBy: [{ vendor: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.radiusAttributeDef.count({ where }),
  ]);

  return paginated(
    attrs.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      vendor: a.vendor,
      attrType: a.attrType,
      description: a.description,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  name: z.string().min(1, "Attribute name is required").max(120),
  type: z.enum(["string", "integer", "ipaddr", "octets"]).default("string"),
  vendor: z.string().max(120).optional().or(z.literal("")).or(z.null()),
  attrType: z.enum(["check", "reply", "both"]).default("both"),
  description: z.string().max(500).optional().or(z.literal("")),
});

// POST /api/v1/radius-attributes
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Globally unique on name (per schema @unique)
  const existing = await db.radiusAttributeDef.findFirst({
    where: { name: data.name },
  });
  if (existing) {
    throw ApiError.duplicate("RADIUS Attribute", "name", data.name);
  }

  const attr = await db.radiusAttributeDef.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      type: data.type,
      vendor: data.vendor || null,
      attrType: data.attrType,
      description: data.description || null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_attribute.create",
    module: "aaa",
    resource: "RadiusAttributeDef",
    resourceId: attr.id,
    requestId,
    newValue: {
      name: attr.name,
      type: attr.type,
      vendor: attr.vendor,
      attrType: attr.attrType,
    },
    message: `Created RADIUS attribute "${attr.name}"`,
  });

  return created(
    {
      id: attr.id,
      name: attr.name,
      type: attr.type,
      attrType: attr.attrType,
    },
    requestId
  );
});
