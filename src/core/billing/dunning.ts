// =====================================================================
// DUNNING ENGINE — automated collections lifecycle.
// Stages (industry standard):
//   1. REMINDER      — invoice due within `reminderDays` (default 3)
//   2. OVERDUE       — dueDate passed, invoice unpaid
//   3. SUSPENSION    — overdue for `suspendAfterDays` (default 7),
//                      honoring post_billing grace periods
// Notifications are emitted on the EventBus so the communication
// module's rule engine can dispatch (email/SMS adapters).
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { eventBus, EVENTS } from "@/core/events/bus";
import { markOverdueInvoices } from "@/core/repositories/billing/invoice";

export const DUNNING_DEFAULTS = {
  reminderDays: 3,
  suspendAfterDays: 7,
} as const;

export interface DunningResult {
  overdueMarked: number;
  remindersSent: number;
  suspended: number;
  graceProtected: number;
  details: Array<{
    stage: "reminder" | "overdue" | "suspension";
    invoiceNumber: string;
    subscriberId?: string;
    note?: string;
  }>;
}

/**
 * Run one dunning pass for a tenant.
 * Idempotent: reminders only fire once per invoice (tracked via invoice metadata
 * in `items` JSON? no — via ActionHistory absence check on subscriber), suspension
 * only transitions active subscribers.
 */
export async function runDunning(
  tenantId: string,
  options: { issuedBy: string; reminderDays?: number; suspendAfterDays?: number; dryRun?: boolean }
): Promise<DunningResult> {
  const reminderDays = options.reminderDays ?? DUNNING_DEFAULTS.reminderDays;
  const suspendAfterDays = options.suspendAfterDays ?? DUNNING_DEFAULTS.suspendAfterDays;
  const dryRun = options.dryRun ?? false;
  const now = new Date();

  const result: DunningResult = {
    overdueMarked: 0,
    remindersSent: 0,
    suspended: 0,
    graceProtected: 0,
    details: [],
  };

  // Stage 0: flip due unpaid invoices to overdue
  result.overdueMarked = dryRun ? 0 : await markOverdueInvoices(tenantId);

  // Stage 1: reminders — unpaid invoices due within reminderDays
  const soonDue = await db.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["issued", "partial"] },
      dueDate: { gte: now, lte: new Date(now.getTime() + reminderDays * 86400_000) },
    },
    select: {
      id: true,
      number: true,
      subscriberId: true,
      total: true,
      dueDate: true,
      subscriber: { select: { id: true, username: true, firstName: true, lastName: true } },
    },
    take: 500,
  });

  for (const inv of soonDue) {
    // Idempotency: skip if a reminder was already recorded for this invoice
    const already = await db.auditLog.findFirst({
      where: { tenantId, action: "billing.dunning.reminder", resourceId: inv.id },
      select: { id: true },
    });
    if (already) continue;

    result.remindersSent++;
    result.details.push({
      stage: "reminder",
      invoiceNumber: inv.number,
      subscriberId: inv.subscriberId ?? undefined,
    });

    if (!dryRun) {
      await eventBus.emit(
        "billing.invoice.due_soon",
        {
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          subscriberId: inv.subscriberId,
          username: inv.subscriber?.username,
          amount: inv.total.toNumber(),
          dueDate: inv.dueDate.toISOString(),
          daysUntilDue: Math.ceil((inv.dueDate.getTime() - now.getTime()) / 86400_000),
        },
        { tenantId, source: "dunning" }
      );
      await db.auditLog.create({
        data: {
          tenantId,
          userId: options.issuedBy,
          action: "billing.dunning.reminder",
          module: "billing",
          resource: "Invoice",
          resourceId: inv.id,
          newValue: JSON.stringify({ invoiceNumber: inv.number }),
          message: `Dunning reminder queued for ${inv.number}`,
        },
      });
    }
  }

  // Stage 2+3: overdue invoices past suspension threshold
  const cutoff = new Date(now.getTime() - suspendAfterDays * 86400_000);
  const longOverdue = await db.invoice.findMany({
    where: {
      tenantId,
      status: "overdue",
      dueDate: { lt: cutoff },
    },
    select: { subscriberId: true, number: true },
    distinct: ["subscriberId"],
    take: 500,
  });

  for (const inv of longOverdue) {
    if (!inv.subscriberId) continue;

    const sub = await db.subscriber.findFirst({
      where: { id: inv.subscriberId, tenantId, status: "active" },
      select: { id: true, username: true },
    });
    if (!sub) continue;

    // Grace period protection
    const postGrace = await db.gracePeriod.findFirst({
      where: {
        tenantId,
        subscriberId: sub.id,
        type: "post_billing",
        status: "active",
        endDate: { gt: now },
      },
    });

    if (postGrace) {
      result.graceProtected++;
      result.details.push({
        stage: "overdue",
        invoiceNumber: inv.number,
        subscriberId: sub.id,
        note: "protected by grace period",
      });
      continue;
    }

    result.suspended++;
    result.details.push({
      stage: "suspension",
      invoiceNumber: inv.number,
      subscriberId: sub.id,
    });

    if (!dryRun) {
      const { transitionSubscriberStatus } = await import("@/core/repositories/subscriber");
      await transitionSubscriberStatus(tenantId, sub.id, "suspended", options.issuedBy);
      await eventBus.emit(
        "billing.subscriber.suspended_nonpayment",
        { subscriberId: sub.id, username: sub.username, invoiceNumber: inv.number },
        { tenantId, source: "dunning" }
      );
    }
  }

  return result;
}
