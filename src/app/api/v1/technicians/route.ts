// =====================================================================
// TECHNICIANS API — list + create
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
  const ctx = await requireModulePermission("operations", "ops.technician.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }, { employeeId: { contains: search } }] } : {}),
  };

  const [technicians, total] = await Promise.all([
    db.technician.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { installations: { where: { status: { in: ["scheduled", "in_progress"] } } } } } },
    }),
    db.technician.count({ where }),
  ]);

  return paginated(
    technicians.map((t) => ({
      id: t.id,
      name: t.name,
      phone: t.phone,
      email: t.email,
      employeeId: t.employeeId,
      status: t.status,
      activeAssignments: t._count.installations,
      createdAt: t.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  employeeId: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "busy", "off_duty"]).default("active"),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.technician.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  const tech = await db.technician.create({
    data: {
      tenantId: ctx.tenantId,
      ...parsed.data,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      employeeId: parsed.data.employeeId || null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "technician.create",
    module: "operations", resource: "Technician", resourceId: tech.id, requestId,
    message: `Created technician ${tech.name}`,
  });

  return created({ id: tech.id, name: tech.name, status: tech.status }, requestId);
});
