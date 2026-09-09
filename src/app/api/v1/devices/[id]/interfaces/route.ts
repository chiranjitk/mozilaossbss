// =====================================================================
// DEVICE INTERFACES API — GET /api/v1/devices/[id]/interfaces
// Returns interfaces with current counter snapshots.
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";

export const dynamic = "force-dynamic";

// GET /api/v1/devices/[id]/interfaces
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const device = await db.device.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, name: true },
  });
  if (!device) {
    throw ApiError.notFound("Device", id);
  }

  const interfaces = await db.deviceInterface.findMany({
    where: { deviceId: id },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return ok({
    deviceId: id,
    deviceName: device.name,
    interfaces: interfaces.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      macAddress: i.macAddress,
      ipAddress: i.ipAddress,
      rxBytes: i.rxBytes.toString(),
      txBytes: i.txBytes.toString(),
      rxPackets: i.rxPackets.toString(),
      txPackets: i.txPackets.toString(),
      status: i.status,
      speedMbps: i.speedMbps,
      lastUpdated: i.lastUpdated,
    })),
  });
});
