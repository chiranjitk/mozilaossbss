// =====================================================================
// RADIUS PROXY SERVERS API — list, create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/radius-proxy-servers
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
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { ipAddress: { contains: search } },
          ],
        }
      : {}),
  };

  const [servers, total] = await Promise.all([
    db.radiusProxyServer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.radiusProxyServer.count({ where }),
  ]);

  return paginated(
    servers.map((s) => ({
      id: s.id,
      name: s.name,
      ipAddress: s.ipAddress,
      authPort: s.authPort,
      acctPort: s.acctPort,
      type: s.type,
      timeout: s.timeout,
      status: s.status,
      hasSecret: true,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  ipAddress: z.string().min(1, "IP address is required").max(64),
  authPort: z.number().int().min(1).max(65535).default(1812),
  acctPort: z.number().int().min(1).max(65535).default(1813),
  secret: z.string().min(1, "Shared secret is required").max(256),
  type: z.enum(["auth", "acct", "both"]).default("both"),
  timeout: z.number().int().min(1).max(60).default(5),
  status: z.enum(["active", "disabled"]).default("active"),
});

// POST /api/v1/radius-proxy-servers
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const existing = await db.radiusProxyServer.findFirst({
    where: { tenantId: ctx.tenantId, name: data.name },
  });
  if (existing) {
    throw ApiError.duplicate("RADIUS Proxy Server", "name", data.name);
  }

  const server = await db.radiusProxyServer.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      ipAddress: data.ipAddress,
      authPort: data.authPort,
      acctPort: data.acctPort,
      secret: data.secret,
      type: data.type,
      timeout: data.timeout,
      status: data.status,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radius_proxy_server.create",
    module: "aaa",
    resource: "RadiusProxyServer",
    resourceId: server.id,
    requestId,
    newValue: {
      name: server.name,
      ipAddress: server.ipAddress,
      authPort: server.authPort,
      acctPort: server.acctPort,
      type: server.type,
    },
    message: `Created RADIUS proxy server "${server.name}" (${server.ipAddress})`,
  });

  return created(
    {
      id: server.id,
      name: server.name,
      ipAddress: server.ipAddress,
      status: server.status,
    },
    requestId
  );
});
