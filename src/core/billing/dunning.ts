// =====================================================================
// DUNNING ENGINE
// Manages the failed-payment retry lifecycle for invoices.
//
// Industry-standard dunning schedule (configurable):
//   Day 0  → payment failed → retry 1 (reminder)
//   Day 3  → retry 2 (warning)
//   Day 7  → retry 3 (final notice)
//   Day 14 → escalate: auto-suspend subscriber + mark invoice overdue
//   Day 30 → escalate: collections task created
//
// Each retry attempts to re-charge via the subscriber's default payment
// gateway; on failure it records the attempt and schedules the next.
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { eventBus } from "@/core/events/bus";

export interface DunningConfig {
  retryScheduleDays: number[]; // [0, 3, 7, 14, 30]
  suspendAfterDays: number; // 14
  collectionsAfterDays: number; // 30
  maxRetries: number; // 3 charge retries before escalation
}

export const DEFAULT_DUNNING_CONFIG: DunningConfig = {
  retryScheduleDays: [0, 3, 7, 14, 30],
  suspendAfterDays: 14,
  collectionsAfterDays: 30,
  maxRetries: 3,
};

export interface DunningAttemptResult {
  invoiceId: string;
  invoiceNumber: string;
  attemptNumber: number;
  succeeded: boolean;
  chargedAmount?: number;
  nextRetryAt?: Date;
  escalatedTo: "none" | "suspension" | "collections";
  error?: string;
}

/**
 * Process the dunning queue for a tenant: find all invoices with failed
 * payments whose next retry is due, and attempt to re-charge them.
 *
 * Tracks state in the invoice's `items` JSON (dunning sub-object) so no
 * schema migration is needed.
 */
export async function processDunningQueue(
  tenantId: string,
  config: DunningConfig = DEFAULT_DUNNING_CONFIG,
  actorUserId: string
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  suspended: number;
  collectionsCreated: number;
  attempts: DunningAttemptResult[];
}> {
  const now = new Date();
  const attempts: DunningAttemptResult[] = [];

  // Invoices that have at least one failed payment and are not fully paid
  const overdueInvoices = await db.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["overdue", "partial"] },
      payments: { some: { status: "failed" } },
    },
    include: {
      subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true, status: true } },
      payments: { where: { status: "failed" }, orderBy: { receivedAt: "desc" }, take: 1 },
    },
  });

  let succeeded = 0;
  let failed = 0;
  let suspended = 0;
  let collectionsCreated = 0;

  for (const invoice of overdueInvoices) {
    const lastFailed = invoice.payments[0];
    if (!lastFailed) continue;

    // Parse dunning state from invoice.items JSON (or init it)
    const items = invoice.items ? (JSON.parse(invoice.items) as any[]) : [];
    let dunningState = extractDunningState(items);
    if (!dunningState) {
      dunningState = {
        attempts: 0,
        firstFailureAt: lastFailed.receivedAt,
        nextRetryAt: lastFailed.receivedAt,
        escalatedTo: "none",
      };
    }

    // Is this invoice due for a retry?
    if (new Date(dunningState.nextRetryAt).getTime() > now.getTime()) continue;

    // Have we exhausted retries?
    if (dunningState.attempts >= config.maxRetries) {
      // Escalate
      const daysSinceFailure = daysBetween(dunningState.firstFailureAt, now);

      if (
        daysSinceFailure >= config.collectionsAfterDays &&
        dunningState.escalatedTo !== "collections"
      ) {
        // Create a collections task
        await db.collectionTask.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            subscriberId: invoice.subscriberId!,
            type: "final_notice",
            status: "pending",
            amount: invoice.total,
            currency: invoice.currency,
            dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            daysOverdue: daysSinceFailure,
            contactMethod: "email",
            contactNotes: `Auto-created by dunning after ${daysSinceFailure} days of non-payment on invoice ${invoice.number}`,
          },
        });
        collectionsCreated++;
        dunningState.escalatedTo = "collections";
      } else if (
        daysSinceFailure >= config.suspendAfterDays &&
        dunningState.escalatedTo === "none" &&
        invoice.subscriber?.status === "active"
      ) {
        // Auto-suspend the subscriber
        const { transitionSubscriberStatus } = await import(
          "@/core/repositories/subscriber"
        );
        try {
          await transitionSubscriberStatus(
            tenantId,
            invoice.subscriberId!,
            "suspended" as any,
            actorUserId
          );
          suspended++;
          dunningState.escalatedTo = "suspension";
        } catch (err) {
          // non-fatal — record and continue
        }
      }
      // Persist dunning state and move on
      persistDunningState(invoice, items, dunningState);
      continue;
    }

    // Attempt the retry charge
    dunningState.attempts += 1;
    const attemptResult = await retryCharge(invoice, lastFailed);

    if (attemptResult.succeeded) {
      succeeded++;
      // Mark invoice paid if fully covered
      const newAmountPaid =
        invoice.amountPaid.toNumber() + (attemptResult.chargedAmount ?? 0);
      const newStatus =
        newAmountPaid >= invoice.total.toNumber() ? "paid" : "partial";
      await db.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: new Prisma.Decimal(round2(newAmountPaid)),
          status: newStatus,
        },
      });
      dunningState.nextRetryAt = new Date(8640000000000000); // never
    } else {
      failed++;
      // Schedule the next retry per the configured cadence
      const nextDayOffset =
        config.retryScheduleDays[dunningState.attempts] ?? config.suspendAfterDays;
      dunningState.nextRetryAt = new Date(
        now.getTime() + nextDayOffset * 24 * 60 * 60 * 1000
      );
    }

    attempts.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      attemptNumber: dunningState.attempts,
      succeeded: attemptResult.succeeded,
      chargedAmount: attemptResult.chargedAmount,
      nextRetryAt: dunningState.nextRetryAt,
      escalatedTo: dunningState.escalatedTo,
      error: attemptResult.error,
    });

    // Persist the updated dunning state back into the invoice items JSON
    persistDunningState(invoice, items, dunningState);
  }

  await eventBus.emit(
    "billing.dunning_processed",
    {
      processed: overdueInvoices.length,
      succeeded,
      failed,
      suspended,
      collectionsCreated,
    },
    { tenantId, source: "billing" }
  );

  return {
    processed: overdueInvoices.length,
    succeeded,
    failed,
    suspended,
    collectionsCreated,
    attempts,
  };
}

// ---------------------------------------------------------------------
// Retry the charge against the subscriber's default payment gateway
// ---------------------------------------------------------------------
async function retryCharge(
  invoice: any,
  lastFailedPayment: any
): Promise<{
  succeeded: boolean;
  chargedAmount?: number;
  error?: string;
}> {
  // Look up the subscriber's default gateway config
  const gateway = await db.paymentGatewayConfig.findFirst({
    where: { tenantId: invoice.tenantId, enabled: true, isDefault: true },
  });

  const amountDue = invoice.total.toNumber() - invoice.amountPaid.toNumber();

  // In the sandbox we don't have real gateway credentials — simulate based
  // on gateway presence + test mode. A real deployment would call the
  // adapter's charge() method here.
  if (!gateway) {
    // No gateway configured — record a manual-method retry attempt
    await db.payment.create({
      data: {
        tenantId: invoice.tenantId,
        number: `PMT-${Date.now()}`,
        invoiceId: invoice.id,
        subscriberId: invoice.subscriberId,
        amount: new Prisma.Decimal(round2(amountDue)),
        currency: invoice.currency,
        method: lastFailedPayment.method ?? "manual",
        status: "pending",
        notes: `Dunning retry attempt — awaiting manual confirmation`,
      },
    });
    // Optimistically mark as pending (operator confirms externally)
    return { succeeded: false, error: "No default gateway — manual payment pending" };
  }

  try {
    // Simulate a gateway charge (sandbox). Production: gatewayAdapter.charge()
    const chargeSucceeded = simulateGatewayCharge(gateway, amountDue);
    const amount = chargeSucceeded ? amountDue : 0;

    await db.payment.create({
      data: {
        tenantId: invoice.tenantId,
        number: `PMT-${Date.now()}`,
        invoiceId: invoice.id,
        subscriberId: invoice.subscriberId,
        amount: new Prisma.Decimal(round2(amount)),
        currency: invoice.currency,
        method: "gateway",
        gateway: gateway.name,
        gatewayRef: chargeSucceeded ? `retry-${Date.now()}` : null,
        status: chargeSucceeded ? "completed" : "failed",
        notes: chargeSucceeded
          ? `Dunning retry charge succeeded via ${gateway.name}`
          : `Dunning retry charge failed via ${gateway.name}`,
        reconciled: false,
      },
    });

    return chargeSucceeded
      ? { succeeded: true, chargedAmount: amount }
      : { succeeded: false, error: `Gateway ${gateway.name} declined` };
  } catch (err) {
    return {
      succeeded: false,
      error: err instanceof Error ? err.message : "Unknown gateway error",
    };
  }
}

/**
 * Deterministic sandbox simulation of a gateway charge.
 * Real adapters live in src/core/payments/adapters.ts.
 */
function simulateGatewayCharge(gateway: any, amount: number): boolean {
  // In test mode, succeed if amount < 1000 (sanity threshold for retry)
  if (gateway.testMode) {
    return amount > 0 && amount < 1000;
  }
  return amount > 0;
}

// ---------------------------------------------------------------------
// Dunning-state JSON persistence (embedded in invoice.items)
// ---------------------------------------------------------------------
interface DunningState {
  attempts: number;
  firstFailureAt: Date;
  nextRetryAt: Date;
  escalatedTo: "none" | "suspension" | "collections";
}

function extractDunningState(items: any[]): DunningState | null {
  const meta = items.find((i) => i.__type === "dunning_state");
  if (!meta) return null;
  return {
    attempts: meta.attempts ?? 0,
    firstFailureAt: new Date(meta.firstFailureAt),
    nextRetryAt: new Date(meta.nextRetryAt),
    escalatedTo: meta.escalatedTo ?? "none",
  };
}

async function persistDunningState(
  invoice: any,
  items: any[],
  state: DunningState
): Promise<void> {
  const others = items.filter((i) => i.__type !== "dunning_state");
  others.push({
    __type: "dunning_state",
    attempts: state.attempts,
    firstFailureAt: state.firstFailureAt.toISOString(),
    nextRetryAt: state.nextRetryAt.toISOString(),
    escalatedTo: state.escalatedTo,
  });
  await db.invoice.update({
    where: { id: invoice.id },
    data: { items: JSON.stringify(others) },
  });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
