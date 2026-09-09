// =====================================================================
// POLICY EVALUATION API
// GET  /api/v1/policy/evaluate?subscriberId=...        → effective policy
// POST /api/v1/policy/evaluate                          → enforce via CoA
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { evaluateSubscriberPolicy } from "@/core/policy/engine";
import { enforcePolicy } from "@/core/policy/enforce";

export const dynamic = "force-dynamic";

// GET — evaluate (read-only) the effective policy for a subscriber
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.read");
  const subscriberId = req.nextUrl.searchParams.get("subscriberId");
  if (!subscriberId) throw ApiError.validation("subscriberId query param required");

  const usageOverride = req.nextUrl.searchParams.get("usageMb");
  const policy = await evaluateSubscriberPolicy(ctx.tenantId, subscriberId, {
    usageOverrideMb: usageOverride ? Number(usageOverride) : undefined,
  });

  return ok(policy, { requestId }, requestId);
});

const enforceSchema = z.object({
  subscriberId: z.string().min(1),
});

// POST — evaluate AND enforce the policy on active sessions via CoA
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.write");
  const body = await req.json();
  const parsed = enforceSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  const policy = await evaluateSubscriberPolicy(ctx.tenantId, parsed.data.subscriberId, {
    context: "enforcement",
    persist: true,
    actorUserId: ctx.userId,
  });
  const result = await enforcePolicy(ctx.tenantId, policy, ctx.userId, requestId);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "policy.enforce",
    module: "policy",
    resource: "Subscriber",
    resourceId: parsed.data.subscriberId,
    requestId,
    newValue: {
      enforcement: policy.enforcement,
      dispatched: result.dispatched,
      summary: policy.summary,
    },
    message: `Policy enforced on ${parsed.data.subscriberId}: ${policy.enforcement} → ${result.dispatched} CoA dispatched. ${policy.summary}`,
  });

  return ok({ policy, enforcement: result }, { requestId }, requestId);
});
