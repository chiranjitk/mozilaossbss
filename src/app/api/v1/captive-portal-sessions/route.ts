// =====================================================================
// CAPTIVE PORTAL SESSIONS API — list (read-only for admin viewing)
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, paginated } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/captive-portal-sessions
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const portalId = url.searchParams.get("portalId");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(portalId && portalId !== "all" ? { portalId } : {}),
    ...(search
      ? {
          OR: [
            { macAddress: { contains: search } },
            { ipAddress: { contains: search } },
            { username: { contains: search } },
            { sessionId: { contains: search } },
          ],
        }
      : {}),
  };

  const [sessions, total] = await Promise.all([
    db.captivePortalSession.findMany({
      where,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        portal: { select: { id: true, name: true, template: true } },
      },
    }),
    db.captivePortalSession.count({ where }),
  ]);

  return paginated(
    sessions.map((s) => ({
      id: s.id,
      portalId: s.portalId,
      portal: s.portal
        ? { id: s.portal.id, name: s.portal.name, template: s.portal.template }
        : null,
      macAddress: s.macAddress,
      ipAddress: s.ipAddress,
      username: s.username,
      sessionId: s.sessionId,
      authMethod: s.authMethod,
      status: s.status,
      startTime: s.startTime,
      endTime: s.endTime,
      dataUsed: s.dataUsed.toString(),
      createdAt: s.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});
