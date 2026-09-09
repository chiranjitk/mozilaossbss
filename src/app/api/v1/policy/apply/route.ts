// =====================================================================
// POLICY RECONCILIATION API
// POST /api/v1/policy/apply   → bulk evaluate + enforce for all subscribers
// =====================================================================

import { NextRequest } from "next/server";
import { apiRoute, ok } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { reconcileAllPolicies } from "@/core/policy/enforce";

export const dynamic = "force-dynamic";

// POST — bulk reconcile all subscribers' policies (nightly cron entrypoint)
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.write");
  const result = await reconcileAllPolicies(ctx.tenantId, ctx.userId, requestId);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "policy.reconcile",
    module: "policy",
    resource: "Subscriber",
    requestId,
    newValue: result,
    message: `Policy reconciliation: ${result.evaluated} evaluated, ${result.enforced} enforced (${result.blocked} blocked, ${result.throttled} throttled). ${result.errors.length} errors.`,
  });

  return ok(result, { requestId }, requestId);
});
