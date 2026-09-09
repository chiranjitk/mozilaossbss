// =====================================================================
// PRORATION API — compute/apply prorated plan change
// GET  /api/v1/billing/proration?subscriberId=...&newPlanId=...  → dry-run
// POST /api/v1/billing/proration                                  → apply
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { proratePlanChange } from "@/core/billing/proration";

export const dynamic = "force-dynamic";

// GET — dry-run proration preview (no persistence)
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const subscriberId = req.nextUrl.searchParams.get("subscriberId");
  const newPlanId = req.nextUrl.searchParams.get("newPlanId");
  if (!subscriberId || !newPlanId) {
    throw ApiError.validation("subscriberId and newPlanId query params required");
  }
  const result = await proratePlanChange(ctx.tenantId, {
    subscriberId,
    newPlanId,
    dryRun: true,
    issuedBy: ctx.userId,
  });
  return ok(result, { requestId }, requestId);
});

const applySchema = z.object({
  subscriberId: z.string().min(1),
  newPlanId: z.string().min(1),
  effectiveAt: z.string().datetime().optional(),
});

// POST — apply the prorated plan change (persists invoice line / credit note)
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.create");
  const body = await req.json();
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  const result = await proratePlanChange(ctx.tenantId, {
    subscriberId: parsed.data.subscriberId,
    newPlanId: parsed.data.newPlanId,
    effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : undefined,
    dryRun: false,
    issuedBy: ctx.userId,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "billing.proration",
    module: "billing",
    resource: "Subscriber",
    resourceId: parsed.data.subscriberId,
    requestId,
    newValue: result,
    message: `Prorated plan change: ${result.oldPlanName} → ${result.newPlanName}. Net adjustment ${result.currency} ${result.netAdjustment} (${result.daysRemaining}/${result.daysInCycle} days).${result.creditNoteNumber ? ` Credit note ${result.creditNoteNumber}.` : ""}`,
  });

  return ok(result, { requestId }, requestId);
});
