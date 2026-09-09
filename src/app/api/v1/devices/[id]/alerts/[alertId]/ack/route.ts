// =====================================================================
// DEVICE ALERT ACK API — PATCH /api/v1/devices/[id]/alerts/[alertId]/ack
// Acknowledge an alert (operator confirms receipt). Records who/when.
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";

export const dynamic = "force-dynamic";

// PATCH /api/v1/devices/[id]/alerts/[alertId]/ack
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.write");
  const parts = new URL(req.url).pathname.split("/");
  const deviceId = parts[4];
  const alertId = parts[7];

  const device = await db.device.findFirst({
    where: { id: deviceId, tenantId: ctx.tenantId },
    select: { id: true, name: true },
  });
  if (!device) {
    throw ApiError.notFound("Device", deviceId);
  }

  const alert = await db.deviceAlert.findFirst({
    where: { id: alertId, deviceId },
  });
  if (!alert) {
    throw ApiError.notFound("DeviceAlert", alertId);
  }
  if (alert.acknowledged) {
    throw ApiError.businessRule("Alert is already acknowledged");
  }

  const now = new Date();
  const updated = await db.deviceAlert.update({
    where: { id: alertId },
    data: {
      acknowledged: true,
      acknowledgedAt: now,
      acknowledgedBy: ctx.userId,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "device.alert.ack",
    module: "devices",
    resource: "DeviceAlert",
    resourceId: alertId,
    requestId,
    newValue: { deviceId, severity: alert.severity, message: alert.message },
    message: `Acknowledged ${alert.severity} alert on ${device.name}: ${alert.message}`,
  });

  await eventBus.emit(
    "alert.acknowledged",
    {
      alertId,
      deviceId,
      severity: alert.severity,
      acknowledgedBy: ctx.userId,
    },
    { tenantId: ctx.tenantId, source: "devices", requestId }
  );

  return ok({
    id: updated.id,
    deviceId,
    acknowledged: updated.acknowledged,
    acknowledgedAt: updated.acknowledgedAt,
    acknowledgedBy: updated.acknowledgedBy,
  });
});
