// =====================================================================
// ALERT DETAIL API — PATCH (acknowledge / resolve)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { acknowledgeAlert, resolveAlert } from "@/core/repositories/monitoring";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  action: z.enum(["acknowledge", "resolve"]),
  resolution: z.string().max(2000).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("monitoring", "monitoring.alerts.ack");
  const id = new URL(req.url).pathname.split("/")[4];

  const alert = await db.alert.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!alert) throw ApiError.notFound("Alert", id);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  if (parsed.data.action === "acknowledge") {
    await acknowledgeAlert(ctx.tenantId, id, ctx.userId);
    await recordAudit({
      tenantId: ctx.tenantId, userId: ctx.userId, action: "alert.acknowledge",
      module: "monitoring", resource: "Alert", resourceId: id, requestId,
      message: `Acknowledged alert ${alert.alertNo}: ${alert.title}`,
    });
    await eventBus.emit(EVENTS.ALERT_ACKNOWLEDGED, { alertId: id, alertNo: alert.alertNo }, { tenantId: ctx.tenantId, source: "monitoring", requestId });
    return ok({ id, status: "acknowledged" });
  }

  if (parsed.data.action === "resolve") {
    await resolveAlert(ctx.tenantId, id, parsed.data.resolution || "");
    await recordAudit({
      tenantId: ctx.tenantId, userId: ctx.userId, action: "alert.resolve",
      module: "monitoring", resource: "Alert", resourceId: id, requestId,
      message: `Resolved alert ${alert.alertNo}: ${alert.title}`,
    });
    return ok({ id, status: "resolved" });
  }

  throw ApiError.businessRule("Unknown action");
});
