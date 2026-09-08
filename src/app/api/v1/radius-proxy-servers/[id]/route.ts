// =====================================================================
// RADIUS PROXY SERVER DETAIL API — GET, PATCH, DELETE
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

// GET /api/v1/radius-proxy-servers/[id]
export const GET = apiRoute(async (req: NextRequest) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const id = idFromReq(req);

  const server = await db.radiusProxyServer.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!server) {
    throw ApiError.notFound("RADIUS Proxy Server", id);
  }

  return ok({
    id: server.id,
    name: server.name,
    ipAddress: server.ipAddress,
    authPort: server.authPort,
    acctPort: server.acctPort,
    secret: server.secret,
    type: server.type,
    timeout: server.timeout,
    status: server.status,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  ipAddress: z.string().min(1).max(64).optional(),
  authPort: z.number().int().min(1).max(65535).optional(),
  acctPort: z.number().int().min(1).max(65535).optional(),
  secret: z.string().min(1).max(256).optional(),
  type: z.enum(["auth", "acct", "both"]).optional(),
  timeout: z.number().int().min(1).max(60).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

// PATCH /api/v1/radius-proxy-servers/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = idFromReq(req);

  const existing = await db.radiusProxyServer.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("RADIUS Proxy Server", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  if (data.name && data.name !== existing.name) {
    const conflict = await db.radiusProxyServer.findFirst({
      where: { tenantId: ctx.tenantId, name: data.name, NOT: { id } },
    });
    if (conflict) {
      throw ApiError.duplicate("RADIUS Proxy Server", "name", data.name);
    }
  }

  const updated = await db.radiusProxyServer.update({
    where: { id },
    data: data,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_proxy_server.update",
    module: "aaa",
    resource: "RadiusProxyServer",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, ipAddress: existing.ipAddress, status: existing.status },
    newValue: data,
    message: `Updated RADIUS proxy server "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    ipAddress: updated.ipAddress,
    status: updated.status,
  });
});

// DELETE /api/v1/radius-proxy-servers/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = idFromReq(req);

  const existing = await db.radiusProxyServer.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("RADIUS Proxy Server", id);
  }

  // Block deletion if any realm still points to this server
  const realmCount = await db.radiusProxyRealm.count({
    where: { tenantId: ctx.tenantId, serverId: id },
  });
  if (realmCount > 0) {
    throw ApiError.businessRule(
      `Cannot delete server "${existing.name}" — ${realmCount} realm(s) still reference it. Reassign or delete the realm(s) first.`,
      { realmCount }
    );
  }

  await db.radiusProxyServer.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_proxy_server.delete",
    module: "aaa",
    resource: "RadiusProxyServer",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, ipAddress: existing.ipAddress },
    message: `Deleted RADIUS proxy server "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
