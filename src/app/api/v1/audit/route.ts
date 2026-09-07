// =====================================================================
// AUDIT LOG API — paginated, filterable audit trail
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, paginated } from "@/core/api/errors";
import { requirePermission } from "@/core/rbac";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/audit — list audit entries with filters
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("audit.read");
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = parsePagination(url.searchParams);

  const search = url.searchParams.get("search") ?? undefined;
  const moduleFilter = url.searchParams.get("module") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const userId = url.searchParams.get("userId") ?? undefined;
  const resource = url.searchParams.get("resource") ?? undefined;
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  const where = {
    tenantId: ctx.tenantId,
    ...(moduleFilter && moduleFilter !== "all" ? { module: moduleFilter } : {}),
    ...(action ? { action: { contains: action } } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(userId ? { userId } : {}),
    ...(resource ? { resource } : {}),
    ...(search
      ? {
          OR: [
            { action: { contains: search } },
            { message: { contains: search } },
            { resource: { contains: search } },
            { resourceId: { contains: search } },
          ],
        }
      : {}),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        }
      : {}),
  };

  const [records, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        user: { select: { id: true, name: true, username: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  return paginated(
    records.map((r) => ({
      id: r.id,
      action: r.action,
      module: r.module,
      resource: r.resource,
      resourceId: r.resourceId,
      status: r.status,
      message: r.message,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      requestId: r.requestId,
      createdAt: r.createdAt,
      user: r.user
        ? { id: r.user.id, name: r.user.name, username: r.user.username, email: r.user.email }
        : null,
    })),
    { page, pageSize, total },
    requestId
  );
});
