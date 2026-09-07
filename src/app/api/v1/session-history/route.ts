// =====================================================================
// SESSION HISTORY API — paginated, filterable historical sessions
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, paginated } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/session-history
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.history.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const nasId = url.searchParams.get("nasId");
  const terminationCause = url.searchParams.get("terminationCause");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  const where = {
    tenantId: ctx.tenantId,
    ...(nasId && nasId !== "all" ? { nasId } : {}),
    ...(terminationCause && terminationCause !== "all" ? { terminationCause } : {}),
    ...(search
      ? {
          OR: [
            { username: { contains: search } },
            { sessionId: { contains: search } },
            { framedIpAddress: { contains: search } },
            { callingStationId: { contains: search } },
          ],
        }
      : {}),
    ...((startDate || endDate)
      ? {
          startTime: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        }
      : {}),
  };

  const [sessions, total] = await Promise.all([
    db.sessionHistory.findMany({
      where,
      orderBy: { startTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        nas: { select: { id: true, name: true, ipAddress: true } },
      },
    }),
    db.sessionHistory.count({ where }),
  ]);

  return paginated(
    sessions.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      username: s.username,
      nas: { id: s.nas.id, name: s.nas.name, ipAddress: s.nas.ipAddress },
      nasIpAddress: s.nasIpAddress,
      framedIpAddress: s.framedIpAddress,
      callingStationId: s.callingStationId,
      startTime: s.startTime,
      stopTime: s.stopTime,
      duration: s.duration,
      inputOctets: Number(s.inputOctets),
      outputOctets: Number(s.outputOctets),
      totalOctets: Number(s.inputOctets) + Number(s.outputOctets),
      terminationCause: s.terminationCause,
    })),
    { page, pageSize, total },
    requestId
  );
});
