// =====================================================================
// RADIUS PROXY REALMS API — list, create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/radius-proxy-realms
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(type && type !== "all" ? { type } : {}),
    ...(search ? { realm: { contains: search } } : {}),
  };

  const [realms, total] = await Promise.all([
    db.radiusProxyRealm.findMany({
      where,
      orderBy: { realm: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        server: {
          select: { id: true, name: true, ipAddress: true, status: true },
        },
      },
    }),
    db.radiusProxyRealm.count({ where }),
  ]);

  return paginated(
    realms.map((r) => ({
      id: r.id,
      realm: r.realm,
      type: r.type,
      serverId: r.serverId,
      server: r.server
        ? {
            id: r.server.id,
            name: r.server.name,
            ipAddress: r.server.ipAddress,
            status: r.server.status,
          }
        : null,
      stripRealm: r.stripRealm,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  realm: z.string().min(1, "Realm is required").max(120),
  type: z.enum(["auth", "acct", "both"]).default("auth"),
  serverId: z.string().min(1, "Server is required"),
  stripRealm: z.boolean().default(false),
  status: z.enum(["active", "disabled"]).default("active"),
});

// POST /api/v1/radius-proxy-realms
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Validate realm uniqueness globally (per schema @unique on realm)
  const existing = await db.radiusProxyRealm.findFirst({
    where: { realm: data.realm },
  });
  if (existing) {
    throw ApiError.duplicate("Realm", "realm", data.realm);
  }

  // Validate server exists in tenant scope
  const server = await db.radiusProxyServer.findFirst({
    where: { id: data.serverId, tenantId: ctx.tenantId },
  });
  if (!server) {
    throw ApiError.businessRule("Selected proxy server does not exist", { serverId: data.serverId });
  }

  const realm = await db.radiusProxyRealm.create({
    data: {
      tenantId: ctx.tenantId,
      realm: data.realm,
      type: data.type,
      serverId: data.serverId,
      stripRealm: data.stripRealm,
      status: data.status,
    },
    include: {
      server: { select: { id: true, name: true, ipAddress: true, status: true } },
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_proxy_realm.create",
    module: "aaa",
    resource: "RadiusProxyRealm",
    resourceId: realm.id,
    requestId,
    newValue: {
      realm: realm.realm,
      type: realm.type,
      serverName: server.name,
      stripRealm: realm.stripRealm,
    },
    message: `Created RADIUS proxy realm "${realm.realm}" → ${server.name}`,
  });

  return created(
    {
      id: realm.id,
      realm: realm.realm,
      status: realm.status,
      server: realm.server
        ? { id: realm.server.id, name: realm.server.name }
        : null,
    },
    requestId
  );
});
