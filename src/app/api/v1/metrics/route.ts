// =====================================================================
// METRICS API — get bandwidth/traffic time-series + current snapshot
// =====================================================================

import { NextRequest } from "next/server";
import { apiRoute, ok } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { getMetricSeries, getCurrentMetrics, getTopTalkers, getTrafficByNas } from "@/core/repositories/monitoring";

export const dynamic = "force-dynamic";

// GET /api/v1/metrics?metric=bandwidth_down&range=24h
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("monitoring", "monitoring.read");
  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") ?? "bandwidth_down";
  const range = url.searchParams.get("range") ?? "24h";
  const interval = parseInt(url.searchParams.get("interval") ?? "5", 10);

  const now = new Date();
  let startDate: Date;
  switch (range) {
    case "1h": startDate = new Date(now.getTime() - 60 * 60 * 1000); break;
    case "6h": startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000); break;
    case "7d": startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case "30d": startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    default: startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
  }

  // If the query asks for "dashboard" (current snapshot + top talkers)
  if (url.searchParams.get("view") === "dashboard") {
    const [currentMetrics, topTalkers, trafficByNas] = await Promise.all([
      getCurrentMetrics(ctx.tenantId),
      getTopTalkers(ctx.tenantId, 10),
      getTrafficByNas(ctx.tenantId),
    ]);

    // Generate bandwidth series from current metrics
    const series = await getMetricSeries(ctx.tenantId, metric, startDate, now, interval);

    return ok({
      currentMetrics,
      series,
      topTalkers,
      trafficByNas,
    });
  }

  const series = await getMetricSeries(ctx.tenantId, metric, startDate, now, interval);
  return ok({ series });
});
