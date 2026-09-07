// =====================================================================
// INCIDENT DETAIL API — GET, PATCH (acknowledge, resolve, close), DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.incident.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const inc = await db.incident.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { assignee: { select: { id: true, name: true, username: true } } },
  });
  if (!inc) throw ApiError.notFound("Incident", id);
  return ok({
    ...inc,
    duration: inc.resolvedAt ? Math.floor((inc.resolvedAt.getTime() - inc.startedAt.getTime()) / 1000) : Math.floor((Date.now() - inc.startedAt.getTime()) / 1000),
  });
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
  severity: z.enum(["minor", "major", "critical", "catastrophic"]).optional(),
  status: z.enum(["open", "acknowledged", "resolved", "closed"]).optional(),
  category: z.enum(["network", "system", "security", "power", "other"]).optional(),
  affectedAreas: z.string().optional().or(z.literal("")),
  assignedTo: z.string().nullable().optional(),
  resolution: z.string().max(2000).optional().or(z.literal("")),
  rootCause: z.string().max(2000).optional().or(z.literal("")),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.incident.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.incident.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Incident", id);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.description === "") data.description = null;
  if (data.affectedAreas === "") data.affectedAreas = null;

  // Handle status transitions with timestamps
  if (data.status === "acknowledged" && !existing.acknowledgedAt) data.acknowledgedAt = new Date();
  if (data.status === "resolved") {
    if (!existing.resolvedAt) data.resolvedAt = new Date();
  }
  if (data.status === "closed" && !existing.closedAt) data.closedAt = new Date();

  const updated = await db.incident.update({ where: { id }, data });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "incident.update",
    module: "operations", resource: "Incident", resourceId: id, requestId,
    oldValue: { status: existing.status, severity: existing.severity },
    newValue: parsed.data, message: `Updated incident ${updated.incidentNo} (status: ${updated.status})`,
  });

  if (updated.status === "resolved") {
    await eventBus.emit(EVENTS.ALERT_ACKNOWLEDGED, { incidentId: id, incidentNo: updated.incidentNo, resolution: parsed.data.resolution }, { tenantId: ctx.tenantId, source: "operations", requestId });
  }

  return ok({ id: updated.id, incidentNo: updated.incidentNo, status: updated.status, severity: updated.severity });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.incident.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.incident.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Incident", id);
  await db.incident.delete({ where: { id } });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "incident.delete",
    module: "operations", resource: "Incident", resourceId: id, requestId,
    message: `Deleted incident ${existing.incidentNo}`,
  });
  return ok({ deleted: true, id });
});
