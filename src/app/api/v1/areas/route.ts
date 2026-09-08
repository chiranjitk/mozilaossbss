// =====================================================================
// AREAS API — list, create (geographic zones for network/operations)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/areas
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.network.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const city = url.searchParams.get("city");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(city && city !== "all" ? { city } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
            { city: { contains: search } },
            { state: { contains: search } },
            { pincode: { contains: search } },
          ],
        }
      : {}),
  };

  const [areas, total] = await Promise.all([
    db.area.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.area.count({ where }),
  ]);

  return paginated(
    areas.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      pincode: a.pincode,
      city: a.city,
      state: a.state,
      latitude: a.latitude,
      longitude: a.longitude,
      status: a.status,
      sortOrder: a.sortOrder,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createAreaSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(500).optional().or(z.literal("")),
  pincode: z.string().max(20).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  state: z.string().max(120).optional().or(z.literal("")),
  latitude: z.number().min(-90).max(90).optional().or(z.null()),
  longitude: z.number().min(-180).max(180).optional().or(z.null()),
  status: z.enum(["active", "disabled"]).default("active"),
  sortOrder: z.number().int().min(0).default(0),
});

// POST /api/v1/areas
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.network.write");
  const body = await req.json();
  const parsed = createAreaSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Unique name per tenant
  const existing = await db.area.findFirst({
    where: { tenantId: ctx.tenantId, name: data.name },
  });
  if (existing) {
    throw ApiError.duplicate("Area", "name", data.name);
  }

  const area = await db.area.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      description: data.description || null,
      pincode: data.pincode || null,
      city: data.city || null,
      state: data.state || null,
      latitude:
        data.latitude === null || data.latitude === undefined ? null : data.latitude,
      longitude:
        data.longitude === null || data.longitude === undefined ? null : data.longitude,
      status: data.status,
      sortOrder: data.sortOrder,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "area.create",
    module: "network",
    resource: "Area",
    resourceId: area.id,
    requestId,
    newValue: { name: area.name, city: area.city, status: area.status },
    message: `Created area "${area.name}"`,
  });

  return created(
    {
      id: area.id,
      name: area.name,
      status: area.status,
    },
    requestId
  );
});
