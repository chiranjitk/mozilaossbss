// =====================================================================
// SUBSCRIBERS API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import {
  listSubscribers,
  createSubscriber,
  SUBSCRIBER_STATUS,
} from "@/core/repositories/subscriber";

export const dynamic = "force-dynamic";

// GET /api/v1/subscribers
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.read");
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const planId = url.searchParams.get("planId") ?? undefined;

  const result = await listSubscribers(
    ctx.tenantId,
    { search, status, planId },
    url.searchParams
  );

  return paginated(
    result.data.map((s) => ({
      id: s.id,
      customerId: s.customerId,
      firstName: s.firstName,
      lastName: s.lastName,
      fullName: `${s.firstName} ${s.lastName}`,
      email: s.email,
      phone: s.phone,
      address: s.address,
      status: s.status,
      username: s.username,
      plan: s.plan
        ? {
            id: s.plan.id,
            name: s.plan.name,
            code: s.plan.code,
            downloadSpeed: s.plan.downloadSpeed,
            uploadSpeed: s.plan.uploadSpeed,
          }
        : null,
      activeSessions: s._count.activeSessions,
      invoiceCount: s._count.invoices,
      paymentCount: s._count.payments,
      complaintCount: s._count.complaints,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    { page: result.page, pageSize: result.pageSize, total: result.total },
    requestId
  );
});

const createSubscriberSchema = z.object({
  customerId: z.string().optional(),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  planId: z.string().optional(),
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  status: z.enum(["pending", "active", "suspended", "terminated"]).default("pending"),
});

// POST /api/v1/subscribers
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.create");
  const body = await req.json();
  const parsed = createSubscriberSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Check duplicate customerId
  if (data.customerId) {
    const existing = await db.subscriber.findFirst({
      where: { tenantId: ctx.tenantId, customerId: data.customerId },
    });
    if (existing) {
      throw ApiError.duplicate("Subscriber", "customerId", data.customerId);
    }
  }

  // Check duplicate username
  if (data.username) {
    const existing = await db.subscriber.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      throw ApiError.duplicate("Subscriber", "username", data.username);
    }
  }

  // Validate plan exists
  if (data.planId) {
    const plan = await db.plan.findFirst({
      where: { id: data.planId, tenantId: ctx.tenantId },
    });
    if (!plan) {
      throw ApiError.businessRule("Selected plan does not exist");
    }
  }

  const subscriber = await createSubscriber({
    tenantId: ctx.tenantId,
    ...data,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "subscriber.create",
    module: "subscribers",
    resource: "Subscriber",
    resourceId: subscriber.id,
    requestId,
    newValue: { customerId: subscriber.customerId, name: `${subscriber.firstName} ${subscriber.lastName}`, username: subscriber.username },
    message: `Created subscriber ${subscriber.customerId} (${subscriber.firstName} ${subscriber.lastName})`,
  });

  await eventBus.emit(
    EVENTS.SUBSCRIBER_CREATED,
    {
      subscriberId: subscriber.id,
      customerId: subscriber.customerId,
      username: subscriber.username,
      planId: subscriber.planId,
      status: subscriber.status,
    },
    { tenantId: ctx.tenantId, source: "subscribers", requestId }
  );

  return created(
    {
      id: subscriber.id,
      customerId: subscriber.customerId,
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      username: subscriber.username,
      status: subscriber.status,
      plan: subscriber.plan
        ? { id: subscriber.plan.id, name: subscriber.plan.name }
        : null,
    },
    requestId
  );
});
