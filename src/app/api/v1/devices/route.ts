// =====================================================================
// DEVICES API — list, create
// Inventory + polling for MikroTik / SNMP / TR-069 / GPON / generic devices.
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

const DEVICE_TYPES = ["mikrotik", "snmp", "tr069", "gpon", "generic"] as const;
const DEVICE_STATUSES = ["online", "offline", "maintenance", "unmanaged"] as const;

// GET /api/v1/devices — paginated list with type/status filters
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(type && type !== "all" && DEVICE_TYPES.includes(type as (typeof DEVICE_TYPES)[number]) ? { type } : {}),
    ...(status && status !== "all" && DEVICE_STATUSES.includes(status as (typeof DEVICE_STATUSES)[number]) ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { ipAddress: { contains: search } },
            { vendor: { contains: search } },
            { model: { contains: search } },
            { serialNumber: { contains: search } },
          ],
        }
      : {}),
  };

  const [devices, total] = await Promise.all([
    db.device.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: {
            interfaces: true,
            alerts: { where: { acknowledged: false } },
          },
        },
        parent: { select: { id: true, name: true } },
      },
    }),
    db.device.count({ where }),
  ]);

  return paginated(
    devices.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      ipAddress: d.ipAddress,
      managementPort: d.managementPort,
      vendor: d.vendor,
      model: d.model,
      serialNumber: d.serialNumber,
      firmwareVersion: d.firmwareVersion,
      status: d.status,
      location: d.location,
      parentId: d.parentId,
      parentName: d.parent?.name ?? null,
      snmpCommunity: d.snmpCommunity ? "***" : null,
      tr069Url: d.tr069Url,
      lastSeenAt: d.lastSeenAt,
      lastPolledAt: d.lastPolledAt,
      latencyMs: d.latencyMs,
      uptime: d.uptime,
      interfaceCount: d._count.interfaces,
      openAlertCount: d._count.alerts,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createDeviceSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  type: z.enum(DEVICE_TYPES).default("generic"),
  ipAddress: z.string().min(1, "IP address required"),
  managementPort: z.number().int().min(1).max(65535).default(8728),
  vendor: z.string().max(80).optional(),
  model: z.string().max(120).optional(),
  serialNumber: z.string().max(120).optional(),
  firmwareVersion: z.string().max(80).optional(),
  status: z.enum(DEVICE_STATUSES).default("unmanaged"),
  location: z.string().max(200).optional(),
  parentId: z.string().optional(),
  credentials: z.record(z.any()).optional(),
  snmpCommunity: z.string().max(120).optional(),
  tr069Url: z.string().url().optional().or(z.literal("")),
  metadata: z.record(z.any()).optional(),
});

// POST /api/v1/devices — create device (type-specific validation)
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.write");
  const body = await req.json();
  const parsed = createDeviceSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // === Type-specific validation (industry-standard adapter pattern) ===
  if (data.type === "snmp" && !data.snmpCommunity) {
    throw ApiError.businessRule("SNMP devices require an snmpCommunity string");
  }
  if (data.type === "tr069" && !data.tr069Url) {
    throw ApiError.businessRule("TR-069 devices require a tr069Url (ACS Connection Request URL)");
  }
  if (data.type === "mikrotik" && !data.credentials?.username) {
    // MikroTik REST API requires admin credentials. Allow creation without
    // credentials but mark as unmanaged — operator must add credentials before
    // polling will succeed.
    data.status = data.status === "online" ? "unmanaged" : data.status;
  }

  // Parent device must exist in same tenant (if topology specified)
  if (data.parentId) {
    const parent = await db.device.findFirst({
      where: { id: data.parentId, tenantId: ctx.tenantId },
    });
    if (!parent) {
      throw ApiError.notFound("Parent Device", data.parentId);
    }
  }

  // Serial number uniqueness (when provided)
  if (data.serialNumber) {
    const dup = await db.device.findUnique({ where: { serialNumber: data.serialNumber } });
    if (dup) {
      throw ApiError.duplicate("Device", "serialNumber", data.serialNumber);
    }
  }

  const device = await db.device.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      type: data.type,
      ipAddress: data.ipAddress,
      managementPort: data.managementPort,
      vendor: data.vendor,
      model: data.model,
      serialNumber: data.serialNumber,
      firmwareVersion: data.firmwareVersion,
      status: data.status,
      location: data.location,
      parentId: data.parentId,
      credentials: data.credentials ? JSON.stringify(data.credentials) : null,
      snmpCommunity: data.snmpCommunity,
      tr069Url: data.tr069Url || null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    },
  });

  await eventBus.emit(
    "device.created",
    {
      deviceId: device.id,
      type: device.type,
      ipAddress: device.ipAddress,
      name: device.name,
    },
    { tenantId: ctx.tenantId, source: "devices", requestId }
  );

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "device.create",
    module: "devices",
    resource: "Device",
    resourceId: device.id,
    requestId,
    newValue: {
      name: device.name,
      type: device.type,
      ipAddress: device.ipAddress,
      vendor: device.vendor,
      status: device.status,
    },
    message: `Created ${device.type} device ${device.name} (${device.ipAddress})`,
  });

  return created(
    {
      id: device.id,
      name: device.name,
      type: device.type,
      ipAddress: device.ipAddress,
      managementPort: device.managementPort,
      status: device.status,
    },
    requestId
  );
});
