// =====================================================================
// LEAD CONVERT API — convert a lead to a subscriber
// POST /api/v1/leads/convert
// Creates a subscriber with the lead's data + RADIUS provisioning
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { createSubscriber } from "@/core/repositories/subscriber";
import { eventBus, EVENTS } from "@/core/events/bus";

export const dynamic = "force-dynamic";

const convertSchema = z.object({
  leadId: z.string().min(1),
  planId: z.string().min(1),
  username: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// POST /api/v1/leads/convert
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.lead.write");
  const body = await req.json();
  const parsed = convertSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const { leadId, planId, username, password } = parsed.data;

  // 1. Find the lead
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: ctx.tenantId },
  });
  if (!lead) throw ApiError.notFound("Lead", leadId);
  if (lead.status === "converted") throw ApiError.businessRule("Lead is already converted");

  // 2. Validate plan exists
  const plan = await db.plan.findFirst({
    where: { id: planId, tenantId: ctx.tenantId },
  });
  if (!plan) throw ApiError.businessRule("Selected plan does not exist");

  // 3. Split lead name into first/last
  const nameParts = lead.name.trim().split(" ");
  const firstName = nameParts[0] || "Lead";
  const lastName = nameParts.slice(1).join(" ") || "Customer";

  // 4. Create subscriber with RADIUS provisioning
  const subscriber = await createSubscriber({
    tenantId: ctx.tenantId,
    firstName,
    lastName,
    email: lead.email || undefined,
    phone: lead.phone || undefined,
    address: lead.address || undefined,
    planId,
    username,
    password,
    status: "active", // Lead conversion = immediate activation
  });

  // 5. Update lead status to "converted"
  await db.lead.update({
    where: { id: leadId },
    data: {
      status: "converted",
      convertedSubscriberId: subscriber.id,
    },
  });

  // 6. Create ActionHistory
  await db.actionHistory.create({
    data: {
      tenantId: ctx.tenantId,
      subscriberId: subscriber.id,
      action: "plan_assign",
      performedBy: ctx.userId,
      newValue: JSON.stringify({
        source: "lead_conversion",
        leadId,
        leadName: lead.name,
        planId,
        username: subscriber.username,
      }),
      notes: `Converted from lead "${lead.name}" (source: ${lead.source})`,
    },
  });

  // 7. Emit events
  await eventBus.emit(EVENTS.SUBSCRIBER_CREATED, {
    subscriberId: subscriber.id,
    customerId: subscriber.customerId,
    username: subscriber.username,
    planId,
    status: "active",
    source: "lead_conversion",
  }, { tenantId: ctx.tenantId, source: "operations", requestId });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "lead.convert",
    module: "operations", resource: "Lead", resourceId: leadId, requestId,
    newValue: { subscriberId: subscriber.id, customerId: subscriber.customerId, planId },
    message: `Converted lead "${lead.name}" to subscriber ${subscriber.customerId} (plan: ${plan.name})`,
  });

  return ok({
    converted: true,
    leadId,
    subscriberId: subscriber.id,
    customerId: subscriber.customerId,
    username: subscriber.username,
    plan: plan.name,
    radiusProvisioned: true,
  });
});
