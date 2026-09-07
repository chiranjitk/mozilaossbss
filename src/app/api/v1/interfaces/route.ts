// =====================================================================
// SYSTEM INTERFACES API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.interface.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const enabled = url.searchParams.get("enabled");

  const where = {
    tenantId: ctx.tenantId,
    ...(enabled === "true" ? { enabled: true } : enabled === "false" ? { enabled: false } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { displayName: { contains: search } },
            { ipAddress: { contains: search } },
            { macAddress: { contains: search } },
          ],
        }
      : {}),
  };

  const [interfaces, total] = await Promise.all([
    db.systemInterface.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.systemInterface.count({ where }),
  ]);

  return paginated(
    interfaces.map((i) => ({
      id: i.id,
      name: i.name,
      displayName: i.displayName,
      type: i.type,
      ipAddress: i.ipAddress,
      macAddress: i.macAddress,
      vlanId: i.vlanId,
      mtu: i.mtu,
      enabled: i.enabled,
      linkStatus: i.linkStatus,
      speedMbps: i.speedMbps,
      duplex: i.duplex,
      rxBytes: Number(i.rxBytes),
      txBytes: Number(i.txBytes),
      rxPackets: Number(i.rxPackets),
      txPackets: Number(i.txPackets),
      rxErrors: i.rxErrors,
      txErrors: i.txErrors,
      nas: i.nasId ? { id: i.nasId, name: "NAS", ipAddress: "" } : null,
      description: i.description,
      lastUpdated: i.lastUpdated,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createInterfaceSchema = z.object({
  name: z.string().min(1, "Interface name required").max(50),
  displayName: z.string().max(100).optional(),
  type: z.enum(["ethernet", "vlan", "pppoe", "bridge", "loopback", "wan"]).default("ethernet"),
  ipAddress: z.string().optional().or(z.literal("")),
  macAddress: z.string().optional().or(z.literal("")),
  vlanId: z.number().int().min(1).max(4094).optional(),
  mtu: z.number().int().min(576).max(9000).default(1500),
  enabled: z.boolean().default(true),
  description: z.string().max(500).optional().or(z.literal("")),
  nasId: z.string().optional(),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.interface.read");
  const body = await req.json();
  const parsed = createInterfaceSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const iface = await db.systemInterface.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      displayName: data.displayName || null,
      type: data.type,
      ipAddress: data.ipAddress || null,
      macAddress: data.macAddress || null,
      vlanId: data.vlanId,
      mtu: data.mtu,
      enabled: data.enabled,
      description: data.description || null,
      nasId: data.nasId || null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "interface.create",
    module: "network",
    resource: "SystemInterface",
    resourceId: iface.id,
    requestId,
    message: `Created interface ${iface.name} (${iface.type})`,
  });

  return created({ id: iface.id, name: iface.name, type: iface.type }, requestId);
});
