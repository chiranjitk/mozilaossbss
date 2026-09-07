// =====================================================================
// ALERTS API — list + create (internal)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { listAlerts } from "@/core/repositories/monitoring";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("monitoring", "monitoring.alerts.read");
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const severity = url.searchParams.get("severity") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;

  const result = await listAlerts(ctx.tenantId, { search, status, severity, category }, url.searchParams);

  return paginated(
    result.data.map((a: any) => ({
      id: a.id,
      alertNo: a.alertNo,
      title: a.title,
      description: a.description,
      severity: a.severity,
      status: a.status,
      category: a.category,
      source: a.source,
      threshold: a.threshold,
      currentValue: a.currentValue,
      triggeredAt: a.triggeredAt,
      acknowledgedAt: a.acknowledgedAt,
      acknowledgedBy: a.acknowledgedBy,
      resolvedAt: a.resolvedAt,
      resolution: a.resolution,
    })),
    { page: result.page, pageSize: result.pageSize, total: result.total },
    requestId
  );
});
