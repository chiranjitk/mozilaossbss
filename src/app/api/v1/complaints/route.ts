// =====================================================================
// COMPLAINTS API — list, create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/complaints
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const category = url.searchParams.get("category");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(priority && priority !== "all" ? { priority } : {}),
    ...(category && category !== "all" ? { category } : {}),
    ...(search
      ? {
          OR: [
            { ticketNo: { contains: search } },
            { subject: { contains: search } },
            { description: { contains: search } },
            { subscriber: { customerId: { contains: search } } },
            { subscriber: { firstName: { contains: search } } },
            { subscriber: { lastName: { contains: search } } },
          ],
        }
      : {}),
  };

  const [complaints, total] = await Promise.all([
    db.complaint.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, name: true, username: true } },
      },
    }),
    db.complaint.count({ where }),
  ]);

  return paginated(
    complaints.map((c) => ({
      id: c.id,
      ticketNo: c.ticketNo,
      subject: c.subject,
      description: c.description,
      category: c.category,
      priority: c.priority,
      status: c.status,
      subscriber: c.subscriber
        ? { customerId: c.subscriber.customerId, name: `${c.subscriber.firstName} ${c.subscriber.lastName}` }
        : null,
      assignee: c.assignee ? { id: c.assignee.id, name: c.assignee.name ?? c.assignee.username } : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createComplaintSchema = z.object({
  subscriberId: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  category: z.enum(["billing", "network", "technical", "other"]).default("other"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  assignedTo: z.string().optional(),
});

// POST /api/v1/complaints
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.write");
  const body = await req.json();
  const parsed = createComplaintSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Generate ticket number: TKT-YYYY-XXXX
  const year = new Date().getFullYear();
  const count = await db.complaint.count({ where: { ticketNo: { startsWith: `TKT-${year}-` } } });
  const ticketNo = `TKT-${year}-${String(count + 1).padStart(4, "0")}`;

  const complaint = await db.complaint.create({
    data: {
      tenantId: ctx.tenantId,
      ticketNo,
      subscriberId: data.subscriberId || null,
      subject: data.subject,
      description: data.description || null,
      category: data.category,
      priority: data.priority,
      status: "open",
      assignedTo: data.assignedTo || null,
    },
    include: {
      subscriber: { select: { customerId: true, firstName: true, lastName: true } },
    },
  });

  // === INDUSTRY STANDARD: SLA deadline calculation based on priority ===
  const slaHours: Record<string, number> = { low: 48, normal: 24, high: 8, urgent: 4 };
  const slaDeadline = new Date(Date.now() + (slaHours[data.priority] || 24) * 60 * 60 * 1000);

  // Auto-assign to best available technician if not assigned
  if (!data.assignedTo) {
    const availableTech = await db.technician.findFirst({
      where: { tenantId: ctx.tenantId, status: "active" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, userId: true },
    });
    if (availableTech?.userId) {
      await db.complaint.update({
        where: { id: complaint.id },
        data: { assignedTo: availableTech.userId, status: "in_progress" },
      });
    }
  }

  // Emit SLA info in event
  await eventBus.emit(
    EVENTS.COMPLAINT_CREATED,
    { complaintId: complaint.id, ticketNo, subject: data.subject, priority: data.priority, slaDeadline: slaDeadline.toISOString(), slaHours: slaHours[data.priority] },
    { tenantId: ctx.tenantId, source: "operations", requestId }
  );

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "complaint.create",
    module: "operations",
    resource: "Complaint",
    resourceId: complaint.id,
    requestId,
    newValue: { ticketNo, subject: data.subject, priority: data.priority, slaDeadline: slaDeadline.toISOString() },
    message: `Created complaint ${ticketNo}: ${data.subject} (SLA: ${slaHours[data.priority]}h, deadline: ${slaDeadline.toISOString()})`,
  });

  return created(
    {
      id: complaint.id,
      ticketNo: complaint.ticketNo,
      subject: complaint.subject,
      status: complaint.status,
      slaDeadline: slaDeadline.toISOString(),
      slaHours: slaHours[data.priority],
    },
    requestId
  );
});
