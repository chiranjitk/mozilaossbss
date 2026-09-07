// =====================================================================
// DNS ZONES API — list + create
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
  const ctx = await requireModulePermission("network", "network.dns.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
          ],
        }
      : {}),
  };

  const [zones, total] = await Promise.all([
    db.dnsZone.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { records: true } } },
    }),
    db.dnsZone.count({ where }),
  ]);

  return paginated(
    zones.map((z) => ({
      id: z.id,
      name: z.name,
      type: z.type,
      soaSerial: z.soaSerial,
      primaryNs: z.primaryNs,
      adminEmail: z.adminEmail,
      status: z.status,
      description: z.description,
      recordCount: z._count.records,
      createdAt: z.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createZoneSchema = z.object({
  name: z.string().min(1, "Zone name is required").max(253),
  type: z.enum(["forward", "reverse"]).default("forward"),
  primaryNs: z.string().optional().or(z.literal("")),
  adminEmail: z.string().email().optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.dns.write");
  const body = await req.json();
  const parsed = createZoneSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const existing = await db.dnsZone.findUnique({ where: { name: data.name } });
  if (existing) {
    throw ApiError.duplicate("DNS zone", "name", data.name);
  }

  const zone = await db.dnsZone.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      type: data.type,
      primaryNs: data.primaryNs || null,
      adminEmail: data.adminEmail || null,
      description: data.description || null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "dnszone.create",
    module: "network",
    resource: "DnsZone",
    resourceId: zone.id,
    requestId,
    message: `Created DNS zone ${zone.name}`,
  });

  return created({ id: zone.id, name: zone.name, status: zone.status }, requestId);
});
