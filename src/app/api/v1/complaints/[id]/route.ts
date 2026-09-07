// =====================================================================
// COMPLAINT DETAIL API — GET, PATCH (update/assign/resolve/close), DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";

export const dynamic = "force-dynamic";

// GET /api/v1/complaints/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const complaint = await db.complaint.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true, email: true, phone: true, address: true } },
      assignee: { select: { id: true, name: true, username: true } },
    },
  });
  if (!complaint) {
    throw ApiError.notFound("Complaint", id);
  }

  return ok({
    id: complaint.id,
    ticketNo: complaint.ticketNo,
    subject: complaint.subject,
    description: complaint.description,
    category: complaint.category,
    priority: complaint.priority,
    status: complaint.status,
    subscriber: complaint.subscriber
      ? {
          id: complaint.subscriber.id,
          customerId: complaint.subscriber.customerId,
          name: `${complaint.subscriber.firstName} ${complaint.subscriber.lastName}`,
          email: complaint.subscriber.email,
          phone: complaint.subscriber.phone,
          address: complaint.subscriber.address,
        }
      : null,
    assignee: complaint.assignee
      ? { id: complaint.assignee.id, name: complaint.assignee.name ?? complaint.assignee.username }
      : null,
    createdAt: complaint.createdAt,
    updatedAt: complaint.updatedAt,
  });
});

const updateSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
  category: z.enum(["billing", "network", "technical", "other"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  assignedTo: z.string().nullable().optional(),
  resolution: z.string().max(2000).optional().or(z.literal("")),
});

// PATCH /api/v1/complaints/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.complaint.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) {
    throw ApiError.notFound("Complaint", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Handle resolution separately (append to description)
  let updateData: any = { ...data };
  if (data.resolution) {
    updateData.description = (existing.description ?? "") + `\n\n--- Resolution ---\n${data.resolution}`;
    updateData.status = data.status || "resolved";
    delete updateData.resolution;
  }

  const updated = await db.complaint.update({
    where: { id },
    data: updateData,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "complaint.update",
    module: "operations",
    resource: "Complaint",
    resourceId: id,
    requestId,
    oldValue: { status: existing.status, priority: existing.priority, assignedTo: existing.assignedTo },
    newValue: data,
    message: `Updated complaint ${existing.ticketNo} (status: ${updated.status})`,
  });

  if (updated.status === "resolved") {
    await eventBus.emit(
      EVENTS.COMPLAINT_RESOLVED,
      { complaintId: id, ticketNo: existing.ticketNo },
      { tenantId: ctx.tenantId, source: "operations", requestId }
    );
  }

  return ok({
    id: updated.id,
    ticketNo: updated.ticketNo,
    status: updated.status,
    priority: updated.priority,
  });
});

// DELETE /api/v1/complaints/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.complaint.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) {
    throw ApiError.notFound("Complaint", id);
  }

  await db.complaint.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "complaint.delete",
    module: "operations",
    resource: "Complaint",
    resourceId: id,
    requestId,
    oldValue: { ticketNo: existing.ticketNo, subject: existing.subject },
    message: `Deleted complaint ${existing.ticketNo}`,
  });

  return ok({ deleted: true, id });
});
