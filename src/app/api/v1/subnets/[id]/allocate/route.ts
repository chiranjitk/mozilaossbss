// =====================================================================
// IP ALLOCATION API — allocate an IP from a subnet
// POST /api/v1/subnets/[id]/allocate
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { allocateIp } from "@/core/repositories/network/subnet";
import { isValidIp } from "@/core/network/cidr";

export const dynamic = "force-dynamic";

const allocateSchema = z.object({
  ipAddress: z.string().refine(isValidIp, "Invalid IP address"),
  assignedTo: z.string().optional(),
  assignedType: z.enum(["subscriber", "nas", "device", "static", "dhcp"]).optional(),
  macAddress: z.string().optional(),
  hostname: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.ipam.write");
  const subnetId = new URL(req.url).pathname.split("/")[4];

  const body = await req.json();
  const parsed = allocateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  try {
    await allocateIp(ctx.tenantId, subnetId, parsed.data.ipAddress, {
      ...parsed.data,
      allocatedBy: ctx.userId,
    });
  } catch (err) {
    throw ApiError.businessRule(
      err instanceof Error ? err.message : "Failed to allocate IP"
    );
  }

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "ip.allocate",
    module: "network",
    resource: "IpAddress",
    resourceId: parsed.data.ipAddress,
    requestId,
    newValue: parsed.data,
    message: `Allocated IP ${parsed.data.ipAddress}`,
  });

  return ok({ allocated: true, ipAddress: parsed.data.ipAddress });
});
