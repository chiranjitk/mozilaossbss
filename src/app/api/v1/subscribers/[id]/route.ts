// =====================================================================
// SUBSCRIBER DETAIL API — GET, PATCH, DELETE + lifecycle actions
// Lifecycle: pending → active → suspended → terminated
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import {
  getSubscriberById,
  updateSubscriber,
  deleteSubscriber,
  transitionSubscriberStatus,
  canTransition,
  SUBSCRIBER_STATUS,
  type SubscriberStatus,
} from "@/core/repositories/subscriber";

export const dynamic = "force-dynamic";

// GET /api/v1/subscribers/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const subscriber = await getSubscriberById(ctx.tenantId, id);
  if (!subscriber) {
    throw ApiError.notFound("Subscriber", id);
  }

  // Fetch related data for Customer 360 view
  const [activeSessions, recentSessions, invoices, payments, complaints, auditLog] =
    await Promise.all([
      db.activeSession.findMany({
        where: { subscriberId: id, status: "active" },
        include: {
          nas: { select: { id: true, name: true, ipAddress: true } },
        },
        orderBy: { startTime: "desc" },
        take: 10,
      }),
      db.sessionHistory.findMany({
        where: { subscriberId: id },
        orderBy: { startTime: "desc" },
        take: 20,
      }),
      db.invoice.findMany({
        where: { subscriberId: id },
        orderBy: { issueDate: "desc" },
        take: 20,
      }),
      db.payment.findMany({
        where: { subscriberId: id },
        orderBy: { receivedAt: "desc" },
        take: 20,
      }),
      db.complaint.findMany({
        where: { subscriberId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { assignee: { select: { id: true, name: true } } },
      }),
      db.auditLog.findMany({
        where: { resource: "Subscriber", resourceId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { id: true, name: true, username: true } } },
      }),
    ]);

  return ok({
    subscriber: {
      id: subscriber.id,
      customerId: subscriber.customerId,
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      fullName: `${subscriber.firstName} ${subscriber.lastName}`,
      email: subscriber.email,
      phone: subscriber.phone,
      address: subscriber.address,
      status: subscriber.status,
      username: subscriber.username,
      hasPassword: !!subscriber.passwordHash,
      plan: subscriber.plan
        ? {
            id: subscriber.plan.id,
            name: subscriber.plan.name,
            code: subscriber.plan.code,
            downloadSpeed: subscriber.plan.downloadSpeed,
            uploadSpeed: subscriber.plan.uploadSpeed,
          }
        : null,
      metadata: subscriber.metadata,
      createdAt: subscriber.createdAt,
      updatedAt: subscriber.updatedAt,
    },
    summary: {
      activeSessions: activeSessions.length,
      totalSessions: recentSessions.length,
      openInvoices: invoices.filter((i) => ["issued", "partial", "overdue"].includes(i.status)).length,
      totalInvoices: invoices.length,
      totalPayments: payments.length,
      openComplaints: complaints.filter((c) => ["open", "in_progress"].includes(c.status)).length,
      totalComplaints: complaints.length,
      lifetimeValue: payments
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + p.amount.toNumber(), 0),
    },
    activeSessions: activeSessions.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      nasName: s.nas.name,
      nasIp: s.nasIpAddress,
      framedIp: s.framedIpAddress,
      mac: s.callingStationId,
      protocol: s.protocol,
      startTime: s.startTime,
      duration: Math.floor((Date.now() - s.startTime.getTime()) / 1000),
      inputOctets: Number(s.inputOctets),
      outputOctets: Number(s.outputOctets),
    })),
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      nasIp: s.nasIpAddress,
      framedIp: s.framedIpAddress,
      mac: s.callingStationId,
      startTime: s.startTime,
      stopTime: s.stopTime,
      duration: s.duration,
      inputOctets: Number(s.inputOctets),
      outputOctets: Number(s.outputOctets),
      terminationCause: s.terminationCause,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      total: i.total.toNumber(),
      amountPaid: i.amountPaid.toNumber(),
      status: i.status,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      number: p.number,
      amount: p.amount.toNumber(),
      method: p.method,
      status: p.status,
      receivedAt: p.receivedAt,
    })),
    complaints: complaints.map((c) => ({
      id: c.id,
      ticketNo: c.ticketNo,
      subject: c.subject,
      status: c.status,
      priority: c.priority,
      assignee: c.assignee?.name,
      createdAt: c.createdAt,
    })),
    auditLog: auditLog.map((a) => ({
      id: a.id,
      action: a.action,
      status: a.status,
      message: a.message,
      createdAt: a.createdAt,
      user: a.user?.name ?? a.user?.username ?? "System",
    })),
  });
});

const updateSubscriberSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  planId: z.string().nullable().optional(),
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(6).optional(),
});

// PATCH /api/v1/subscribers/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await getSubscriberById(ctx.tenantId, id);
  if (!existing) {
    throw ApiError.notFound("Subscriber", id);
  }

  const body = await req.json();

  // Check if this is a lifecycle action (status change)
  if (body.action && typeof body.action === "string") {
    return handleLifecycleAction(ctx, existing, body.action, body.reason, requestId);
  }

  // Otherwise it's a profile update
  const parsed = updateSubscriberSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Check username uniqueness if changing
  if (data.username && data.username !== existing.username) {
    const dup = await db.subscriber.findUnique({ where: { username: data.username } });
    if (dup) {
      throw ApiError.duplicate("Subscriber", "username", data.username);
    }
  }

  // Validate plan exists
  if (data.planId) {
    const plan = await db.plan.findFirst({ where: { id: data.planId, tenantId: ctx.tenantId } });
    if (!plan) {
      throw ApiError.businessRule("Selected plan does not exist");
    }
  }

  const updated = await updateSubscriber(ctx.tenantId, id, data);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "subscriber.update",
    module: "subscribers",
    resource: "Subscriber",
    resourceId: id,
    requestId,
    oldValue: {
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      planId: existing.planId,
      username: existing.username,
    },
    newValue: data,
    message: `Updated subscriber ${existing.customerId}`,
  });

  if (data.planId && data.planId !== existing.planId) {
    await eventBus.emit(
      EVENTS.PLAN_PRICING_CHANGED,
      { subscriberId: id, oldPlanId: existing.planId, newPlanId: data.planId },
      { tenantId: ctx.tenantId, source: "subscribers", requestId }
    );
  }

  return ok({
    id: updated.id,
    firstName: updated.firstName,
    lastName: updated.lastName,
    username: updated.username,
    status: updated.status,
    plan: updated.plan ? { id: updated.plan.id, name: updated.plan.name } : null,
  });
});

// Lifecycle actions: activate, suspend, reactivate, terminate
async function handleLifecycleAction(
  ctx: { tenantId: string; userId: string },
  subscriber: any,
  action: string,
  reason: string | undefined,
  requestId: string
) {
  const actionMap: Record<string, SubscriberStatus> = {
    activate: SUBSCRIBER_STATUS.ACTIVE,
    suspend: SUBSCRIBER_STATUS.SUSPENDED,
    reactivate: SUBSCRIBER_STATUS.ACTIVE,
    terminate: SUBSCRIBER_STATUS.TERMINATED,
  };

  const newStatus = actionMap[action];
  if (!newStatus) {
    throw ApiError.businessRule(`Unknown lifecycle action: ${action}`);
  }

  if (!canTransition(subscriber.status, newStatus)) {
    throw ApiError.businessRule(
      `Cannot ${action} a subscriber in "${subscriber.status}" state. Valid transitions: ${subscriber.status} → ${subscriber.status === "pending" ? "active/terminated" : subscriber.status === "active" ? "suspended/terminated" : subscriber.status === "suspended" ? "active/terminated" : "none"}`
    );
  }

  const updated = await transitionSubscriberStatus(
    ctx.tenantId,
    subscriber.id,
    newStatus,
    ctx.userId
  );

  const auditAction = `subscriber.${action}`;
  const eventMap: Record<string, string> = {
    suspend: EVENTS.SUBSCRIBER_SUSPENDED,
    reactivate: EVENTS.SUBSCRIBER_REACTIVATED,
    activate: EVENTS.SUBSCRIBER_REACTIVATED,
    terminate: EVENTS.SUBSCRIBER_TERMINATED,
  };

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: auditAction,
    module: "subscribers",
    resource: "Subscriber",
    resourceId: subscriber.id,
    requestId,
    oldValue: { status: subscriber.status },
    newValue: { status: newStatus, reason },
    message: `${action.charAt(0).toUpperCase() + action.slice(1)}d subscriber ${subscriber.customerId}${reason ? `: ${reason}` : ""}`,
  });

  if (eventMap[action]) {
    await eventBus.emit(
      eventMap[action],
      {
        subscriberId: subscriber.id,
        customerId: subscriber.customerId,
        username: subscriber.username,
        oldStatus: subscriber.status,
        newStatus,
        reason,
      },
      { tenantId: ctx.tenantId, source: "subscribers", requestId }
    );
  }

  return ok({
    id: updated.id,
    customerId: updated.customerId,
    status: updated.status,
    action,
  });
}

// DELETE /api/v1/subscribers/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.delete");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await getSubscriberById(ctx.tenantId, id);
  if (!existing) {
    throw ApiError.notFound("Subscriber", id);
  }

  try {
    await deleteSubscriber(ctx.tenantId, id);
  } catch (err) {
    throw ApiError.businessRule(
      err instanceof Error ? err.message : "Failed to delete subscriber"
    );
  }

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "subscriber.delete",
    module: "subscribers",
    resource: "Subscriber",
    resourceId: id,
    requestId,
    oldValue: { customerId: existing.customerId, username: existing.username },
    message: `Deleted subscriber ${existing.customerId}`,
  });

  await eventBus.emit(
    EVENTS.SUBSCRIBER_TERMINATED,
    { subscriberId: id, customerId: existing.customerId, reason: "deleted" },
    { tenantId: ctx.tenantId, source: "subscribers", requestId }
  );

  return ok({ deleted: true, id });
});
