// =====================================================================
// TECHNICIAN DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.technician.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const tech = await db.technician.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!tech) throw ApiError.notFound("Technician", id);
  return ok(tech);
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  employeeId: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "busy", "off_duty"]).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.technician.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.technician.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Technician", id);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.phone === "") data.phone = null;
  if (data.email === "") data.email = null;
  if (data.employeeId === "") data.employeeId = null;

  const updated = await db.technician.update({ where: { id }, data });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "technician.update",
    module: "operations", resource: "Technician", resourceId: id, requestId,
    oldValue: { name: existing.name, status: existing.status },
    newValue: parsed.data, message: `Updated technician ${updated.name}`,
  });
  return ok({ id: updated.id, name: updated.name, status: updated.status });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.technician.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.technician.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Technician", id);

  const activeCount = await db.installation.count({ where: { technicianId: id, status: { in: ["scheduled", "in_progress"] } } });
  if (activeCount > 0) throw ApiError.businessRule(`Cannot delete technician with ${activeCount} active assignment(s)`);

  await db.technician.delete({ where: { id } });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "technician.delete",
    module: "operations", resource: "Technician", resourceId: id, requestId,
    message: `Deleted technician ${existing.name}`,
  });
  return ok({ deleted: true, id });
});
