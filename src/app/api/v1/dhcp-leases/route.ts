// =====================================================================
// DHCP LEASES API — list
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, paginated } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.dhcp.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const state = url.searchParams.get("state");

  const where = {
    tenantId: ctx.tenantId,
    ...(state && state !== "all" ? { state } : {}),
    ...(search
      ? {
          OR: [
            { ipAddress: { contains: search } },
            { macAddress: { contains: search } },
            { hostname: { contains: search } },
            { clientId: { contains: search } },
          ],
        }
      : {}),
  };

  const [leases, total] = await Promise.all([
    db.dhcpLease.findMany({
      where,
      orderBy: { leaseStart: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { subnet: { select: { id: true, name: true, cidrNotation: true } } },
    }),
    db.dhcpLease.count({ where }),
  ]);

  return paginated(
    leases.map((l) => ({
      id: l.id,
      ipAddress: l.ipAddress,
      macAddress: l.macAddress,
      hostname: l.hostname,
      clientId: l.clientId,
      subnet: l.subnet
        ? { id: l.subnet.id, name: l.subnet.name, cidrNotation: l.subnet.cidrNotation }
        : null,
      leaseStart: l.leaseStart,
      leaseEnd: l.leaseEnd,
      leaseTime: l.leaseTime,
      state: l.state,
    })),
    { page, pageSize, total },
    requestId
  );
});
