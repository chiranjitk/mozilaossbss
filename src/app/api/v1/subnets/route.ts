// =====================================================================
// SUBNETS API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import {
  listSubnets,
  createSubnet,
} from "@/core/repositories/network/subnet";
import { isValidIp, isValidCidr } from "@/core/network/cidr";

export const dynamic = "force-dynamic";

// GET /api/v1/subnets
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.ipam.read");
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;

  const result = await listSubnets(ctx.tenantId, { search, status, type }, url.searchParams);

  return paginated(
    result.data.map((s) => ({
      id: s.id,
      name: s.name,
      network: s.network,
      cidr: s.cidr,
      cidrNotation: s.cidrNotation,
      gateway: s.gateway,
      dnsPrimary: s.dnsPrimary,
      dnsSecondary: s.dnsSecondary,
      vlanId: s.vlanId,
      type: s.type,
      status: s.status,
      description: s.description,
      totalAddresses: s.totalAddresses,
      usableAddresses: s.usableAddresses,
      allocatedCount: s.allocatedCount,
      utilization: s.usableAddresses > 0 ? (s.allocatedCount / s.usableAddresses) * 100 : 0,
      activeDhcpLeases: s._count.dhcpLeases,
      createdAt: s.createdAt,
    })),
    { page: result.page, pageSize: result.pageSize, total: result.total },
    requestId
  );
});

const createSubnetSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  network: z.string().refine(isValidIp, "Invalid network IP address"),
  cidr: z.number().int().refine(isValidCidr, "CIDR must be 0-32"),
  gateway: z.string().optional().or(z.literal("")),
  dnsPrimary: z.string().optional().or(z.literal("")),
  dnsSecondary: z.string().optional().or(z.literal("")),
  vlanId: z.number().int().min(1).max(4094).optional(),
  type: z.enum(["data", "voice", "management", "guest", "pppoe"]).default("data"),
  description: z.string().max(500).optional().or(z.literal("")),
  autoAllocateIps: z.boolean().default(true),
});

// POST /api/v1/subnets
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.ipam.write");
  const body = await req.json();
  const parsed = createSubnetSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  try {
    const subnet = await createSubnet({
      tenantId: ctx.tenantId,
      ...data,
    });

    await recordAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "subnet.create",
      module: "network",
      resource: "Subnet",
      resourceId: subnet.id,
      requestId,
      newValue: { name: subnet.name, cidrNotation: subnet.cidrNotation, type: subnet.type },
      message: `Created subnet ${subnet.name} (${subnet.cidrNotation})`,
    });

    return created(
      {
        id: subnet.id,
        name: subnet.name,
        cidrNotation: subnet.cidrNotation,
        status: subnet.status,
      },
      requestId
    );
  } catch (err) {
    throw ApiError.businessRule(
      err instanceof Error ? err.message : "Failed to create subnet"
    );
  }
});
