// =====================================================================
// DNS ZONE DETAIL API — GET, PATCH, DELETE + records management
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/dns-zones/[id] — zone with records
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.dns.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const zone = await db.dnsZone.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { records: { orderBy: { name: "asc" } } },
  });
  if (!zone) {
    throw ApiError.notFound("DNS zone", id);
  }

  return ok({
    id: zone.id,
    name: zone.name,
    type: zone.type,
    soaSerial: zone.soaSerial,
    soaRefresh: zone.soaRefresh,
    soaRetry: zone.soaRetry,
    soaExpire: zone.soaExpire,
    soaMinimum: zone.soaMinimum,
    primaryNs: zone.primaryNs,
    adminEmail: zone.adminEmail,
    status: zone.status,
    description: zone.description,
    records: zone.records.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      value: r.value,
      ttl: r.ttl,
      priority: r.priority,
      weight: r.weight,
      port: r.port,
      status: r.status,
    })),
  });
});

const updateZoneSchema = z.object({
  primaryNs: z.string().optional().or(z.literal("")),
  adminEmail: z.string().email().optional().or(z.literal("")),
  status: z.enum(["active", "disabled"]).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
});

// PATCH /api/v1/dns-zones/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.dns.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.dnsZone.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("DNS zone", id);

  const body = await req.json();

  // Check if this is a record create/update/delete action
  if (body.recordAction) {
    return handleRecordAction(ctx, id, body, requestId);
  }

  const parsed = updateZoneSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data = parsed.data;

  const updated = await db.dnsZone.update({
    where: { id },
    data: {
      ...data,
      primaryNs: data.primaryNs || null,
      adminEmail: data.adminEmail || null,
      description: data.description || null,
      soaSerial: { increment: 1 }, // increment serial on any change
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "dnszone.update",
    module: "network",
    resource: "DnsZone",
    resourceId: id,
    requestId,
    message: `Updated DNS zone ${updated.name} (serial ${updated.soaSerial})`,
  });

  return ok({ id: updated.id, name: updated.name, status: updated.status });
});

// DELETE /api/v1/dns-zones/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.dns.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const zone = await db.dnsZone.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!zone) throw ApiError.notFound("DNS zone", id);

  await db.dnsZone.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "dnszone.delete",
    module: "network",
    resource: "DnsZone",
    resourceId: id,
    requestId,
    message: `Deleted DNS zone ${zone.name}`,
  });

  return ok({ deleted: true, id });
});

// ---------------------------------------------------------------------
// RECORD ACTIONS — create/update/delete DNS records within a zone
// ---------------------------------------------------------------------

const recordSchema = z.object({
  name: z.string().min(1).max(253),
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "PTR"]),
  value: z.string().min(1),
  ttl: z.number().int().min(60).max(86400).default(3600),
  priority: z.number().int().optional(),
  weight: z.number().int().optional(),
  port: z.number().int().optional(),
});

async function handleRecordAction(
  ctx: { tenantId: string; userId: string },
  zoneId: string,
  body: any,
  requestId: string
) {
  const action = body.recordAction as "create" | "update" | "delete";
  const zone = await db.dnsZone.findFirst({ where: { id: zoneId, tenantId: ctx.tenantId } });
  if (!zone) throw ApiError.notFound("DNS zone", zoneId);

  if (action === "create") {
    const parsed = recordSchema.safeParse(body.record);
    if (!parsed.success) throw ApiError.validation(parsed.error);
    const r = parsed.data;

    const record = await db.dnsRecord.create({
      data: {
        tenantId: ctx.tenantId,
        zoneId,
        name: r.name,
        type: r.type,
        value: r.value,
        ttl: r.ttl,
        priority: r.priority,
        weight: r.weight,
        port: r.port,
        status: "active",
      },
    });

    await db.dnsZone.update({
      where: { id: zoneId },
      data: { soaSerial: { increment: 1 } },
    });

    await recordAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "dnsrecord.create",
      module: "network",
      resource: "DnsRecord",
      resourceId: record.id,
      requestId,
      message: `Created DNS record ${r.name} ${r.type} ${r.value} in zone ${zone.name}`,
    });

    return ok({ id: record.id, action: "created" });
  }

  if (action === "update") {
    const recordId = body.recordId as string;
    const parsed = recordSchema.partial().safeParse(body.record);
    if (!parsed.success) throw ApiError.validation(parsed.error);

    const updated = await db.dnsRecord.update({
      where: { id: recordId },
      data: parsed.data,
    });

    await db.dnsZone.update({
      where: { id: zoneId },
      data: { soaSerial: { increment: 1 } },
    });

    await recordAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "dnsrecord.update",
      module: "network",
      resource: "DnsRecord",
      resourceId: recordId,
      requestId,
      message: `Updated DNS record ${updated.name} in zone ${zone.name}`,
    });

    return ok({ id: updated.id, action: "updated" });
  }

  if (action === "delete") {
    const recordId = body.recordId as string;
    await db.dnsRecord.delete({ where: { id: recordId } });

    await db.dnsZone.update({
      where: { id: zoneId },
      data: { soaSerial: { increment: 1 } },
    });

    await recordAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "dnsrecord.delete",
      module: "network",
      resource: "DnsRecord",
      resourceId: recordId,
      requestId,
      message: `Deleted DNS record in zone ${zone.name}`,
    });

    return ok({ deleted: true, id: recordId });
  }

  throw ApiError.businessRule(`Unknown record action: ${action}`);
}
