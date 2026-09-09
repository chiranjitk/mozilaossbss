// =====================================================================
// BILLING LIFECYCLE API — reminder / overdue / suspension pass
// POST /api/v1/billing/lifecycle   → run one dunning-lifecycle pass
// Uses src/core/billing/lifecycle.ts (runDunning)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { runDunning } from "@/core/billing/lifecycle";

export const dynamic = "force-dynamic";

const schema = z.object({
  dryRun: z.boolean().default(false),
  reminderDays: z.number().int().min(0).max(30).optional(),
  suspendAfterDays: z.number().int().min(1).max(90).optional(),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.run");
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  const result = await runDunning(ctx.tenantId, {
    issuedBy: ctx.userId,
    dryRun: parsed.data.dryRun,
    reminderDays: parsed.data.reminderDays,
    suspendAfterDays: parsed.data.suspendAfterDays,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "billing.lifecycle",
    module: "billing",
    resource: "Invoice",
    requestId,
    newValue: {
      dryRun: parsed.data.dryRun,
      overdueMarked: result.overdueMarked,
      remindersSent: result.remindersSent,
      suspended: result.suspended,
      graceProtected: result.graceProtected,
    },
    message: `Lifecycle pass: ${result.overdueMarked} overdue, ${result.remindersSent} reminders, ${result.suspended} suspended, ${result.graceProtected} grace-protected${parsed.data.dryRun ? " (DRY RUN)" : ""}`,
  });

  if (!parsed.data.dryRun && (result.suspended > 0 || result.remindersSent > 0)) {
    await eventBus.emit(
      EVENTS.BILLING_RUN_COMPLETED,
      { lifecycle: true, suspended: result.suspended, remindersSent: result.remindersSent },
      { tenantId: ctx.tenantId, source: "billing", requestId }
    );
  }

  return ok({ ...result, dryRun: parsed.data.dryRun });
});
