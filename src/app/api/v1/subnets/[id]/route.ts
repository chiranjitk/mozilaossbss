// =====================================================================
// SUBNET DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import {
  getSubnetById,
  updateSubnet,
  deleteSubnet,
} from "@/core/repositories/network/subnet";

export const dynamic = "force-dynamic";

// GET /api/v1/subnets/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.ipam.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const subnet = await getSubnetById(ctx.tenantId, id);
  if (!subnet) {
    throw ApiError.notFound("Subnet", id);
  }

  return ok({
    id: subnet.id,
    name: subnet.name,
    network: subnet.network,
    cidr: subnet.cidr,
    cidrNotation: subnet.cidrNotation,
    gateway: subnet.gateway,
    dnsPrimary: subnet.dnsPrimary,
    dnsSecondary: subnet.dnsSecondary,
    vlanId: subnet.vlanId,
    type: subnet.type,
    status: subnet.status,
    description: subnet.description,
    totalAddresses: subnet.totalAddresses,
    usableAddresses: subnet.usableAddresses,
    allocatedCount: subnet.allocatedCount,
    utilization: subnet.usableAddresses > 0 ? (subnet.allocatedCount / subnet.usableAddresses) * 100 : 0,
    createdAt: subnet.createdAt,
    updatedAt: subnet.updatedAt,
    ipAddresses: (subnet as any).ipAddresses?.map((ip: any) => ({
      id: ip.id,
      ipAddress: ip.ipAddress,
      status: ip.status,
      assignedTo: ip.assignedTo,
      assignedType: ip.assignedType,
      macAddress: ip.macAddress,
      hostname: ip.hostname,
      notes: ip.notes,
      allocatedAt: ip.allocatedAt,
    })) ?? [],
  });
});

const updateSubnetSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  gateway: z.string().optional().or(z.literal("")),
  dnsPrimary: z.string().optional().or(z.literal("")),
  dnsSecondary: z.string().optional().or(z.literal("")),
  vlanId: z.number().int().min(1).max(4094).nullable().optional(),
  type: z.enum(["data", "voice", "management", "guest", "pppoe"]).optional(),
  status: z.enum(["active", "reserved", "exhausted", "archived"]).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
});

// PATCH /api/v1/subnets/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.ipam.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await getSubnetById(ctx.tenantId, id);
  if (!existing) {
    throw ApiError.notFound("Subnet", id);
  }

  const body = await req.json();
  const parsed = updateSubnetSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Clean up empty strings
  const cleanData: any = { ...data };
  if (cleanData.gateway === "") cleanData.gateway = null;
  if (cleanData.dnsPrimary === "") cleanData.dnsPrimary = null;
  if (cleanData.dnsSecondary === "") cleanData.dnsSecondary = null;
  if (cleanData.description === "") cleanData.description = null;

  const updated = await updateSubnet(ctx.tenantId, id, cleanData);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "subnet.update",
    module: "network",
    resource: "Subnet",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, status: existing.status },
    newValue: data,
    message: `Updated subnet ${updated.name}`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    status: updated.status,
  });
});

// DELETE /api/v1/subnets/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.ipam.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await getSubnetById(ctx.tenantId, id);
  if (!existing) {
    throw ApiError.notFound("Subnet", id);
  }

  try {
    await deleteSubnet(ctx.tenantId, id);
  } catch (err) {
    throw ApiError.businessRule(
      err instanceof Error ? err.message : "Failed to delete subnet"
    );
  }

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "subnet.delete",
    module: "network",
    resource: "Subnet",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, cidrNotation: existing.cidrNotation },
    message: `Deleted subnet ${existing.name} (${existing.cidrNotation})`,
  });

  return ok({ deleted: true, id });
});
