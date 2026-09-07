// =====================================================================
// NAS CLIENTS API — list, create, update, delete
// NAS = Network Access Server (the RADIUS client, e.g. a MikroTik router)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/nas
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
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
            { ipAddress: { contains: search } },
            { type: { contains: search } },
          ],
        }
      : {}),
  };

  const [nasClients, total] = await Promise.all([
    db.nasClient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: {
            activeSessions: { where: { status: "active" } },
          },
        },
      },
    }),
    db.nasClient.count({ where }),
  ]);

  return paginated(
    nasClients.map((n) => ({
      id: n.id,
      name: n.name,
      ipAddress: n.ipAddress,
      type: n.type,
      coaPort: n.coaPort,
      status: n.status,
      lastSeenAt: n.lastSeenAt,
      activeSessionCount: n._count.activeSessions,
      // sharedSecret intentionally NOT returned in list view for security
      hasSecret: !!n.sharedSecret,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createNasSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  ipAddress: z.string().min(1, "IP address required"),
  sharedSecret: z.string().min(4, "Shared secret must be at least 4 characters"),
  type: z.enum(["mikrotik", "cisco", "juniper", "generic", "other"]).default("generic"),
  coaPort: z.number().int().min(1).max(65535).default(3799),
  status: z.enum(["active", "disabled"]).default("active"),
});

// POST /api/v1/nas
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.create");
  const body = await req.json();
  const parsed = createNasSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Check duplicate IP
  const existing = await db.nasClient.findUnique({
    where: { ipAddress: data.ipAddress },
  });
  if (existing) {
    throw ApiError.duplicate("NAS", "ipAddress", data.ipAddress);
  }

  const nas = await db.nasClient.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      ipAddress: data.ipAddress,
      sharedSecret: data.sharedSecret,
      type: data.type,
      coaPort: data.coaPort,
      status: data.status,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "nas.create",
    module: "aaa",
    resource: "NasClient",
    resourceId: nas.id,
    requestId,
    newValue: { name: nas.name, ipAddress: nas.ipAddress, type: nas.type },
    message: `Created NAS ${nas.name} (${nas.ipAddress})`,
  });

  return created(
    {
      id: nas.id,
      name: nas.name,
      ipAddress: nas.ipAddress,
      type: nas.type,
      status: nas.status,
    },
    requestId
  );
});
