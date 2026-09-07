// =====================================================================
// INSTALLATION DETAIL API — GET, PATCH (update status, complete, assign)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.installation.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const inst = await db.installation.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true, address: true, phone: true } },
      technician: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!inst) throw ApiError.notFound("Installation", id);
  return ok(inst);
});

const updateSchema = z.object({
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled", "failed"]).optional(),
  technicianId: z.string().nullable().optional(),
  scheduledDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  type: z.enum(["new_install", "upgrade", "repair", "disconnect", "relocation"]).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.installation.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.installation.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Installation", id);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.scheduledDate) data.scheduledDate = new Date(data.scheduledDate);
  if (data.status === "completed" && !existing.completedAt) data.completedAt = new Date();

  const updated = await db.installation.update({ where: { id }, data });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "installation.update",
    module: "operations", resource: "Installation", resourceId: id, requestId,
    oldValue: { status: existing.status, technicianId: existing.technicianId },
    newValue: parsed.data, message: `Updated work order ${updated.workOrderNo} (status: ${updated.status})`,
  });
  return ok({ id: updated.id, workOrderNo: updated.workOrderNo, status: updated.status });
});
