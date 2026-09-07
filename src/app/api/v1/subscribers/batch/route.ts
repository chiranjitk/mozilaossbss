// =====================================================================
// SUBSCRIBER BATCH API — bulk create from CSV/JSON
// POST /api/v1/subscribers/batch with array of subscriber inputs
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { bulkCreateSubscribers } from "@/core/repositories/subscriber";

export const dynamic = "force-dynamic";

const batchSchema = z.object({
  subscribers: z
    .array(
      z.object({
        customerId: z.string().optional(),
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional().or(z.literal("")),
        address: z.string().optional().or(z.literal("")),
        planId: z.string().optional(),
        username: z.string().min(3).max(50).optional(),
        password: z.string().min(6).optional(),
        status: z.enum(["pending", "active", "suspended", "terminated"]).default("active"),
      })
    )
    .min(1, "At least one subscriber is required")
    .max(500, "Maximum 500 subscribers per batch"),
});

// POST /api/v1/subscribers/batch
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.create");
  const body = await req.json();
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  const result = await bulkCreateSubscribers(ctx.tenantId, parsed.data.subscribers);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "subscriber.batch_create",
    module: "subscribers",
    resource: "Subscriber",
    requestId,
    newValue: { count: parsed.data.subscribers.length, created: result.created.length, errors: result.errors.length },
    message: `Batch provisioned ${result.created.length} subscriber(s), ${result.errors.length} error(s)`,
  });

  return ok({
    created: result.created.length,
    errors: result.errors.length,
    errorDetails: result.errors,
    createdIds: result.created.map((s) => s.id),
  });
});
