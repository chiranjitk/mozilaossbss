// =====================================================================
// SUBNET REPOSITORY — IPAM data access + subnet allocation logic
// Handles subnet CRUD, IP pool generation, allocation tracking.
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  paginate,
  parsePagination,
  type PaginatedResult,
} from "@/core/repositories/base";
import {
  isValidIp,
  isValidCidr,
  getNetworkAddress,
  totalAddresses,
  usableAddresses,
  formatCidr,
  listUsableIps,
  isIpInSubnet,
} from "@/core/network/cidr";

export interface SubnetListFilters {
  search?: string;
  status?: string;
  type?: string;
}

export const SUBNET_INCLUDE = {
  _count: {
    select: {
      ipAddresses: { where: { status: "allocated" } },
      dhcpLeases: { where: { state: "active" } },
    },
  },
} satisfies Prisma.SubnetInclude;

export type SubnetWithRelations = Prisma.SubnetGetPayload<{ include: typeof SUBNET_INCLUDE }>;

export async function listSubnets(
  tenantId: string,
  filters: SubnetListFilters,
  query: URLSearchParams
): Promise<PaginatedResult<SubnetWithRelations>> {
  const { page, pageSize } = parsePagination(query);

  const where: Prisma.SubnetWhereInput = {
    tenantId,
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.type && filters.type !== "all" ? { type: filters.type } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search } },
            { network: { contains: filters.search } },
            { cidrNotation: { contains: filters.search } },
            { description: { contains: filters.search } },
          ],
        }
      : {}),
  };

  return paginate<
    SubnetWithRelations,
    Prisma.SubnetWhereInput,
    Prisma.SubnetOrderByWithRelationInput
  >(
    {
      findMany: (args) => db.subnet.findMany({ ...args, include: SUBNET_INCLUDE }),
      count: (args) => db.subnet.count(args),
    },
    { where, orderBy: { createdAt: "desc" }, page, pageSize }
  );
}

export async function getSubnetById(
  tenantId: string,
  id: string
): Promise<SubnetWithRelations | null> {
  return db.subnet.findFirst({
    where: { id, tenantId },
    include: {
      ...SUBNET_INCLUDE,
      ipAddresses: {
        orderBy: { ipAddress: "asc" },
        take: 1000, // limit to first 1000 IPs for detail view
      },
    },
  });
}

export interface CreateSubnetInput {
  tenantId: string;
  name: string;
  network: string;
  cidr: number;
  gateway?: string;
  dnsPrimary?: string;
  dnsSecondary?: string;
  vlanId?: number;
  type?: string;
  description?: string;
  autoAllocateIps?: boolean; // if true, pre-generate all IP pool entries
}

export async function createSubnet(
  input: CreateSubnetInput
): Promise<SubnetWithRelations> {
  // Validate
  if (!isValidIp(input.network)) {
    throw new Error("Invalid network address");
  }
  if (!isValidCidr(input.cidr)) {
    throw new Error("Invalid CIDR (must be 0-32)");
  }

  // Normalize network address (e.g. 192.168.1.5/24 → 192.168.1.0/24)
  const normalizedNetwork = getNetworkAddress(input.network, input.cidr);
  const cidrNotation = formatCidr(normalizedNetwork, input.cidr);
  const total = totalAddresses(input.cidr);
  const usable = usableAddresses(input.cidr);

  // Check for overlapping subnets
  const existing = await db.subnet.findFirst({
    where: { tenantId: input.tenantId },
  });
  if (existing) {
    // Simple overlap check: same cidrNotation = duplicate
    const dup = await db.subnet.findUnique({
      where: {
        tenantId_cidrNotation: {
          tenantId: input.tenantId,
          cidrNotation,
        },
      },
    });
    if (dup) {
      throw new Error(`Subnet ${cidrNotation} already exists`);
    }
  }

  // Create subnet
  const subnet = await db.subnet.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      network: normalizedNetwork,
      cidr: input.cidr,
      cidrNotation,
      gateway: input.gateway || null,
      dnsPrimary: input.dnsPrimary || null,
      dnsSecondary: input.dnsSecondary || null,
      vlanId: input.vlanId || null,
      type: input.type || "data",
      description: input.description || null,
      totalAddresses: total,
      usableAddresses: usable,
      allocatedCount: 0,
    },
    include: SUBNET_INCLUDE,
  });

  // Optionally pre-allocate IP pool (only for small subnets to avoid memory issues)
  if (input.autoAllocateIps && input.cidr >= 24) {
    const ips = listUsableIps(normalizedNetwork, input.cidr, 500);
    // Batch create in chunks to avoid too many queries
    const chunkSize = 100;
    for (let i = 0; i < ips.length; i += chunkSize) {
      const chunk = ips.slice(i, i + chunkSize);
      await db.ipAddress.createMany({
        data: chunk.map((ip) => ({
          tenantId: input.tenantId,
          subnetId: subnet.id,
          ipAddress: ip,
          status: "available",
        })),
      });
    }
  }

  return subnet;
}

export interface UpdateSubnetInput {
  name?: string;
  gateway?: string;
  dnsPrimary?: string;
  dnsSecondary?: string;
  vlanId?: number;
  type?: string;
  status?: string;
  description?: string;
}

export async function updateSubnet(
  tenantId: string,
  id: string,
  input: UpdateSubnetInput
): Promise<SubnetWithRelations> {
  return db.subnet.update({
    where: { id },
    data: input,
    include: SUBNET_INCLUDE,
  });
}

export async function deleteSubnet(
  tenantId: string,
  id: string
): Promise<void> {
  const subnet = await db.subnet.findFirst({ where: { id, tenantId } });
  if (!subnet) throw new Error("Subnet not found");

  // Check for allocated IPs
  const allocatedCount = await db.ipAddress.count({
    where: { subnetId: id, status: "allocated" },
  });
  if (allocatedCount > 0) {
    throw new Error(
      `Cannot delete subnet with ${allocatedCount} allocated IP(s). Release them first.`
    );
  }

  // Check for active DHCP leases
  const leaseCount = await db.dhcpLease.count({
    where: { subnetId: id, state: "active" },
  });
  if (leaseCount > 0) {
    throw new Error(
      `Cannot delete subnet with ${leaseCount} active DHCP lease(s). Release them first.`
    );
  }

  await db.subnet.delete({ where: { id } });
}

/**
 * Allocate an IP from a subnet to a subscriber/device.
 */
export async function allocateIp(
  tenantId: string,
  subnetId: string,
  ipAddress: string,
  options: {
    assignedTo?: string;
    assignedType?: string;
    macAddress?: string;
    hostname?: string;
    notes?: string;
    allocatedBy?: string;
  }
): Promise<void> {
  const subnet = await db.subnet.findFirst({ where: { id: subnetId, tenantId } });
  if (!subnet) throw new Error("Subnet not found");

  if (!isIpInSubnet(ipAddress, subnet.network, subnet.cidr)) {
    throw new Error(`IP ${ipAddress} is not in subnet ${subnet.cidrNotation}`);
  }

  // Find or create the IP record
  const existing = await db.ipAddress.findUnique({
    where: { ipAddress },
  });

  if (existing && existing.status === "allocated") {
    throw new Error(`IP ${ipAddress} is already allocated`);
  }

  if (existing) {
    await db.ipAddress.update({
      where: { ipAddress },
      data: {
        status: "allocated",
        assignedTo: options.assignedTo || null,
        assignedType: options.assignedType || null,
        macAddress: options.macAddress || null,
        hostname: options.hostname || null,
        notes: options.notes || null,
        allocatedAt: new Date(),
        allocatedBy: options.allocatedBy || "system",
      },
    });
  } else {
    await db.ipAddress.create({
      data: {
        tenantId,
        subnetId,
        ipAddress,
        status: "allocated",
        assignedTo: options.assignedTo || null,
        assignedType: options.assignedType || null,
        macAddress: options.macAddress || null,
        hostname: options.hostname || null,
        notes: options.notes || null,
        allocatedAt: new Date(),
        allocatedBy: options.allocatedBy || "system",
      },
    });
  }

  // Update subnet allocated count
  await db.subnet.update({
    where: { id: subnetId },
    data: { allocatedCount: { increment: 1 } },
  });
}

/**
 * Release an allocated IP back to available.
 */
export async function releaseIp(
  tenantId: string,
  ipAddress: string
): Promise<void> {
  const ip = await db.ipAddress.findUnique({
    where: { ipAddress },
    include: { subnet: { select: { id: true, tenantId: true } } },
  });
  if (!ip || ip.subnet.tenantId !== tenantId) {
    throw new Error("IP not found");
  }
  if (ip.status !== "allocated") {
    throw new Error("IP is not allocated");
  }

  await db.ipAddress.update({
    where: { ipAddress },
    data: {
      status: "available",
      assignedTo: null,
      assignedType: null,
      macAddress: null,
      hostname: null,
      notes: null,
      allocatedAt: null,
      allocatedBy: null,
    },
  });

  await db.subnet.update({
    where: { id: ip.subnet.id },
    data: { allocatedCount: { decrement: 1 } },
  });
}

/**
 * Get IP utilization stats for a tenant.
 */
export async function getIpamStats(tenantId: string) {
  const [subnets, totalAddresses, allocatedIps, activeLeases] = await Promise.all([
    db.subnet.count({ where: { tenantId } }),
    db.subnet.aggregate({
      _sum: { totalAddresses: true, usableAddresses: true },
      where: { tenantId },
    }),
    db.ipAddress.count({ where: { tenantId, status: "allocated" } }),
    db.dhcpLease.count({ where: { tenantId, state: "active" } }),
  ]);

  return {
    totalSubnets: subnets,
    totalAddresses: totalAddresses._sum.totalAddresses ?? 0,
    totalUsable: totalAddresses._sum.usableAddresses ?? 0,
    allocatedIps,
    activeLeases,
  };
}
