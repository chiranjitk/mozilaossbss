// =====================================================================
// RADIUS PROXY REALM DETAIL API — GET, PATCH, DELETE
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

// GET /api/v1/radius-proxy-realms/[id]
export const GET = apiRoute(async (req: NextRequest) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const id = idFromReq(req);

  const realm = await db.radiusProxyRealm.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      server: { select: { id: true, name: true, ipAddress: true, status: true } },
    },
  });
  if (!realm) {
    throw ApiError.notFound("RadiusProxyRealm", id);
  }

  return ok({
    id: realm.id,
    realm: realm.realm,
    type: realm.type,
    serverId: realm.serverId,
    server: realm.server,
    stripRealm: realm.stripRealm,
    status: realm.status,
    createdAt: realm.createdAt,
    updatedAt: realm.updatedAt,
  });
});

const updateSchema = z.object({
  realm: z.string().min(1).max(120).optional(),
  type: z.enum(["auth", "acct", "both"]).optional(),
  serverId: z.string().min(1).optional(),
  stripRealm: z.boolean().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

// PATCH /api/v1/radius-proxy-realms/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = idFromReq(req);

  const existing = await db.radiusProxyRealm.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("RadiusProxyRealm", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Uniqueness check on realm
  if (data.realm && data.realm !== existing.realm) {
    const conflict = await db.radiusProxyRealm.findFirst({
      where: { realm: data.realm, NOT: { id } },
    });
    if (conflict) {
      throw ApiError.duplicate("Realm", "realm", data.realm);
    }
  }

  // Validate server exists if changing
  if (data.serverId && data.serverId !== existing.serverId) {
    const server = await db.radiusProxyServer.findFirst({
      where: { id: data.serverId, tenantId: ctx.tenantId },
    });
    if (!server) {
      throw ApiError.businessRule("Selected proxy server does not exist", {
        serverId: data.serverId,
      });
    }
  }

  const updated = await db.radiusProxyRealm.update({
    where: { id },
    data: data,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_proxy_realm.update",
    module: "aaa",
    resource: "RadiusProxyRealm",
    resourceId: id,
    requestId,
    oldValue: {
      realm: existing.realm,
      type: existing.type,
      serverId: existing.serverId,
      status: existing.status,
    },
    newValue: data,
    message: `Updated RADIUS proxy realm "${updated.realm}"`,
  });

  return ok({
    id: updated.id,
    realm: updated.realm,
    status: updated.status,
  });
});

// DELETE /api/v1/radius-proxy-realms/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = idFromReq(req);

  const existing = await db.radiusProxyRealm.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("RadiusProxyRealm", id);
  }

  await db.radiusProxyRealm.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_proxy_realm.delete",
    module: "aaa",
    resource: "RadiusProxyRealm",
    resourceId: id,
    requestId,
    oldValue: { realm: existing.realm, type: existing.type },
    message: `Deleted RADIUS proxy realm "${existing.realm}"`,
  });

  return ok({ deleted: true, id });
});
