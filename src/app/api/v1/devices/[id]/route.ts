// =====================================================================
// DEVICE DETAIL API — GET, PATCH, DELETE
// GET returns interfaces + recent alerts + topology
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";

export const dynamic = "force-dynamic";

const DEVICE_TYPES = ["mikrotik", "snmp", "tr069", "gpon", "generic"] as const;
const DEVICE_STATUSES = ["online", "offline", "maintenance", "unmanaged"] as const;

async function resolveDevice(id: string, tenantId: string) {
  return db.device.findFirst({
    where: { id, tenantId },
    include: {
      parent: { select: { id: true, name: true, type: true, ipAddress: true } },
      children: { select: { id: true, name: true, type: true, status: true, ipAddress: true } },
      _count: {
        select: {
          interfaces: true,
          alerts: { where: { acknowledged: false } },
        },
      },
    },
  });
}

// GET /api/v1/devices/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const device = await resolveDevice(id, ctx.tenantId);
  if (!device) {
    throw ApiError.notFound("Device", id);
  }

  const [interfaces, recentAlerts] = await Promise.all([
    db.deviceInterface.findMany({
      where: { deviceId: id },
      orderBy: { name: "asc" },
    }),
    db.deviceAlert.findMany({
      where: { deviceId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return ok({
    id: device.id,
    name: device.name,
    type: device.type,
    ipAddress: device.ipAddress,
    managementPort: device.managementPort,
    vendor: device.vendor,
    model: device.model,
    serialNumber: device.serialNumber,
    firmwareVersion: device.firmwareVersion,
    status: device.status,
    location: device.location,
    parentId: device.parentId,
    parent: device.parent,
    children: device.children,
    hasCredentials: !!device.credentials,
    snmpCommunity: device.snmpCommunity ? "***" : null,
    tr069Url: device.tr069Url,
    lastSeenAt: device.lastSeenAt,
    lastPolledAt: device.lastPolledAt,
    latencyMs: device.latencyMs,
    uptime: device.uptime,
    metadata: device.metadata,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
    summary: {
      interfaceCount: device._count.interfaces,
      openAlertCount: device._count.alerts,
    },
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
    recentAlerts: recentAlerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      message: a.message,
      metric: a.metric,
      value: a.value,
      acknowledged: a.acknowledged,
      createdAt: a.createdAt,
      resolvedAt: a.resolvedAt,
    })),
  });
});

const updateDeviceSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  type: z.enum(DEVICE_TYPES).optional(),
  ipAddress: z.string().min(1).optional(),
  managementPort: z.number().int().min(1).max(65535).optional(),
  vendor: z.string().max(80).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  serialNumber: z.string().max(120).nullable().optional(),
  firmwareVersion: z.string().max(80).nullable().optional(),
  status: z.enum(DEVICE_STATUSES).optional(),
  location: z.string().max(200).nullable().optional(),
  parentId: z.string().nullable().optional(),
  credentials: z.record(z.any()).nullable().optional(),
  snmpCommunity: z.string().max(120).nullable().optional(),
  tr069Url: z.string().url().nullable().or(z.literal("")).optional(),
  metadata: z.record(z.any()).nullable().optional(),
});

// PATCH /api/v1/devices/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.device.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Device", id);
  }

  const body = await req.json();
  const parsed = updateDeviceSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  if (data.parentId && data.parentId === id) {
    throw ApiError.businessRule("A device cannot be its own parent");
  }
  if (data.parentId) {
    const parent = await db.device.findFirst({
      where: { id: data.parentId, tenantId: ctx.tenantId },
    });
    if (!parent) throw ApiError.notFound("Parent Device", data.parentId);
  }

  const updated = await db.device.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.ipAddress !== undefined ? { ipAddress: data.ipAddress } : {}),
      ...(data.managementPort !== undefined ? { managementPort: data.managementPort } : {}),
      ...(data.vendor !== undefined ? { vendor: data.vendor } : {}),
      ...(data.model !== undefined ? { model: data.model } : {}),
      ...(data.serialNumber !== undefined ? { serialNumber: data.serialNumber } : {}),
      ...(data.firmwareVersion !== undefined ? { firmwareVersion: data.firmwareVersion } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      ...(data.credentials !== undefined
        ? { credentials: data.credentials ? JSON.stringify(data.credentials) : null }
        : {}),
      ...(data.snmpCommunity !== undefined ? { snmpCommunity: data.snmpCommunity } : {}),
      ...(data.tr069Url !== undefined ? { tr069Url: data.tr069Url || null } : {}),
      ...(data.metadata !== undefined
        ? { metadata: data.metadata ? JSON.stringify(data.metadata) : null }
        : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "device.update",
    module: "devices",
    resource: "Device",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      type: existing.type,
      status: existing.status,
      ipAddress: existing.ipAddress,
    },
    newValue: parsed.data,
    message: `Updated device ${updated.name}`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    type: updated.type,
    ipAddress: updated.ipAddress,
    status: updated.status,
  });
});

// DELETE /api/v1/devices/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const device = await db.device.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { _count: { select: { children: true } } },
  });
  if (!device) {
    throw ApiError.notFound("Device", id);
  }

  // Detach children instead of blocking delete — operator can re-parent.
  if (device._count.children > 0) {
    await db.device.updateMany({
      where: { parentId: id },
      data: { parentId: null },
    });
  }

  await db.device.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "device.delete",
    module: "devices",
    resource: "Device",
    resourceId: id,
    requestId,
    oldValue: {
      name: device.name,
      type: device.type,
      ipAddress: device.ipAddress,
    },
    message: `Deleted device ${device.name}`,
  });

  await eventBus.emit(
    "device.deleted",
    { deviceId: id, name: device.name, type: device.type },
    { tenantId: ctx.tenantId, source: "devices", requestId }
  );

  return ok({ deleted: true, id });
});
