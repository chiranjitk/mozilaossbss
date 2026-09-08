// =====================================================================
// COA EVENTS API — list (read-only)
// CoA (Change-of-Authorization) events emitted to NAS devices
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, paginated } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/coa-events
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
            { subscriberId: { contains: search } },
            { sessionId: { contains: search } },
            { nasIpAddress: { contains: search } },
            { requestedBy: { contains: search } },
            { errorMessage: { contains: search } },
          ],
        }
      : {}),
  };

  const [events, total] = await Promise.all([
    db.coaEvent.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.coaEvent.count({ where }),
  ]);

  return paginated(
    events.map((e) => ({
      id: e.id,
      type: e.type,
      status: e.status,
      subscriberId: e.subscriberId,
      sessionId: e.sessionId,
      nasIpAddress: e.nasIpAddress,
      coaPort: e.coaPort,
      attributes: e.attributes,
      response: e.response,
      errorMessage: e.errorMessage,
      requestedBy: e.requestedBy,
      requestedAt: e.requestedAt,
      processedAt: e.processedAt,
      createdAt: e.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});
