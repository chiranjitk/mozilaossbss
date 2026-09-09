// =====================================================================
// DEVICE ALERTS API — GET /api/v1/devices/[id]/alerts
// Filterable by acknowledged (true | false | all)
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/devices/[id]/alerts
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.read");
  const url = new URL(req.url);
  const id = url.pathname.split("/")[4];
  const { page, pageSize } = parsePagination(url.searchParams);
  const acknowledged = url.searchParams.get("acknowledged");
  const severity = url.searchParams.get("severity");

  const device = await db.device.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, name: true },
  });
  if (!device) {
    throw ApiError.notFound("Device", id);
  }

  const where = {
    deviceId: id,
    ...(acknowledged === "true" ? { acknowledged: true } : {}),
    ...(acknowledged === "false" ? { acknowledged: false } : {}),
    ...(severity && severity !== "all" ? { severity } : {}),
  };

  const [alerts, total] = await Promise.all([
    db.deviceAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.deviceAlert.count({ where }),
  ]);

  return paginated(
    alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      message: a.message,
      metric: a.metric,
      value: a.value,
      acknowledged: a.acknowledged,
      acknowledgedAt: a.acknowledgedAt,
      acknowledgedBy: a.acknowledgedBy,
      createdAt: a.createdAt,
      resolvedAt: a.resolvedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});
