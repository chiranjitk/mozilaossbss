// =====================================================================
// GPON INFRASTRUCTURE API — OLTs, ports and splitters
// GET /api/v1/devices/gpon → OLTs with port utilisation + splitters
// POST /api/v1/devices/gpon → register an OLT
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.gpon.read");

  const [olts, splitters] = await Promise.all([
    db.olt.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        ipAddress: true,
        vendor: true,
        model: true,
        status: true,
        totalPorts: true,
        usedPorts: true,
        location: true,
        firmware: true,
        lastUpdated: true,
      },
    }),
    db.splitter.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        location: true,
        oltId: true,
        portNumber: true,
        status: true,
      },
    }),
  ]);

  const withUtilisation = olts.map((o) => ({
    ...o,
    utilisationPct:
      o.totalPorts > 0 ? Math.round((o.usedPorts / o.totalPorts) * 100) : 0,
  }));

  return ok(
    { olts: withUtilisation, splitters, totalOlts: olts.length, totalSplitters: splitters.length },
    { requestId },
    requestId
  );
});

const createSchema = z.object({
  name: z.string().min(2).max(100),
  ipAddress: z.string().ip(),
  vendor: z.enum(["zte", "huawei", "fiberhome", "vsol", "bdcom", "generic"]).default("generic"),
  model: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  totalPorts: z.number().int().min(1).max(128).default(16),
  firmware: z.string().max(100).optional(),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("devices", "device.gpon.write");
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  const olt = await db.olt.create({
    data: {
      tenantId: ctx.tenantId,
      name: parsed.data.name,
      ipAddress: parsed.data.ipAddress,
      vendor: parsed.data.vendor,
      model: parsed.data.model ?? null,
      location: parsed.data.location ?? null,
      totalPorts: parsed.data.totalPorts,
      firmware: parsed.data.firmware ?? null,
      status: "active",
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "device.gpon.olt.create",
    module: "devices",
    resource: "Olt",
    resourceId: olt.id,
    requestId,
    newValue: { name: olt.name, ipAddress: olt.ipAddress, vendor: olt.vendor },
    message: `Registered OLT ${olt.name} (${olt.ipAddress})`,
  });

  return ok(olt, { requestId }, requestId);
});
