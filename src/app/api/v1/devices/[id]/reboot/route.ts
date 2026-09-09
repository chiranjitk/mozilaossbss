// =====================================================================
// DEVICE REBOOT API — POST /api/v1/devices/[id]/reboot
// In production: MikroTik /system reboot; TR-069: cwmp:Reboot RPC;
// SNMP: SET hrSystemInit.0; GPON: OLT reboot-onu command.
// Here we emit the event so the device worker (or vendor adapter) picks it up
// and performs the real action. Audit log records the operator's intent.
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";

export const dynamic = "force-dynamic";

// POST /api/v1/devices/[id]/reboot
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const device = await db.device.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!device) {
    throw ApiError.notFound("Device", id);
  }

  // Devices in maintenance mode cannot be rebooted (intentional lockout)
  if (device.status === "maintenance") {
    throw ApiError.businessRule("Device is in maintenance mode — exit maintenance before rebooting");
  }

  // Mark offline immediately; operator-initiated reboot clears session state.
  const updated = await db.device.update({
    where: { id },
    data: {
      status: "offline",
      lastPolledAt: new Date(),
      uptime: 0,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "device.reboot",
    module: "devices",
    resource: "Device",
    resourceId: id,
    requestId,
    newValue: { name: device.name, type: device.type },
    message: `Reboot triggered on ${device.type} device ${device.name} (${device.ipAddress})`,
  });

  await eventBus.emit(
    "device.reboot",
    {
      deviceId: id,
      name: device.name,
      type: device.type,
      ipAddress: device.ipAddress,
      initiatedBy: ctx.userId,
    },
    { tenantId: ctx.tenantId, source: "devices", requestId }
  );

  return ok({
    deviceId: id,
    name: updated.name,
    type: updated.type,
    status: updated.status,
    message: `Reboot command emitted — device will return online after boot cycle`,
  });
});
