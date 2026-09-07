// =====================================================================
// RUN BILLING API — generate invoices for all active subscribers
// POST /api/v1/billing/run
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { runBilling, markOverdueInvoices } from "@/core/repositories/billing/invoice";

export const dynamic = "force-dynamic";

const runBillingSchema = z.object({
  billingCycle: z.string().optional(),
  dryRun: z.boolean().default(false),
  markOverdue: z.boolean().default(true),
});

// POST /api/v1/billing/run
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.run");
  const body = await req.json().catch(() => ({}));
  const parsed = runBillingSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  // First mark overdue invoices
  let overdueMarked = 0;
  if (parsed.data.markOverdue && !parsed.data.dryRun) {
    overdueMarked = await markOverdueInvoices(ctx.tenantId);
  }

  const result = await runBilling(ctx.tenantId, {
    billingCycle: parsed.data.billingCycle,
    dryRun: parsed.data.dryRun,
    issuedBy: ctx.userId,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "billing.run",
    module: "billing",
    resource: "Invoice",
    requestId,
    newValue: {
      dryRun: parsed.data.dryRun,
      generated: result.generated,
      skipped: result.skipped,
      overdueMarked,
      totalAmount: result.totalAmount,
      errors: result.errors.length,
    },
    message: `Billing run: ${result.generated} invoices generated, ${result.skipped} skipped, ${overdueMarked} marked overdue${parsed.data.dryRun ? " (DRY RUN)" : ""}`,
  });

  if (!parsed.data.dryRun && result.generated > 0) {
    await eventBus.emit(
      EVENTS.BILLING_RUN_COMPLETED,
      { generated: result.generated, totalAmount: result.totalAmount, overdueMarked },
      { tenantId: ctx.tenantId, source: "billing", requestId }
    );
  }

  return ok({
    ...result,
    overdueMarked,
    dryRun: parsed.data.dryRun,
  });
});
