// =====================================================================
// PRORATION ENGINE
// When a subscriber changes plans mid-billing-cycle, compute the prorated
// credit for the unused portion of the OLD plan and the prorated charge
// for the remaining portion of the NEW plan. Produces a credit note +
// a new invoice line item, never double-charging the subscriber.
//
// Formula (industry-standard daily proration):
//   daysInCycle   = days in the current billing cycle (28/30/31)
//   daysElapsed   = floor((now − cycleStart) / 1d)
//   daysRemaining = daysInCycle − daysElapsed
//   oldCredit     = oldPrice × (daysRemaining / daysInCycle)
//   newCharge     = newPrice × (daysRemaining / daysInCycle)
//   netAdjustment = newCharge − oldCredit    (positive = subscriber owes more)
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { eventBus } from "@/core/events/bus";

export interface ProrationInput {
  subscriberId: string;
  newPlanId: string;
  effectiveAt?: Date; // defaults to now
  dryRun?: boolean;
  issuedBy: string;
}

export interface ProrationResult {
  subscriberId: string;
  oldPlanId: string | null;
  oldPlanName: string | null;
  newPlanId: string;
  newPlanName: string;
  cycleStart: Date;
  cycleEnd: Date;
  daysInCycle: number;
  daysElapsed: number;
  daysRemaining: number;
  oldPrice: number;
  newPrice: number;
  oldCredit: number; // credit for unused old plan
  newCharge: number; // charge for remaining new plan
  netAdjustment: number; // +ve = subscriber owes; -ve = refund due
  creditNoteNumber?: string;
  invoiceLineItemId?: string;
  currency: string;
}

/**
 * Compute + persist a prorated plan change.
 * - If netAdjustment < 0 → issues a CreditNote (refund credit on account)
 * - If netAdjustment > 0 → adds a line item to the subscriber's current
 *   open invoice (or creates a new one-time invoice)
 */
export async function proratePlanChange(
  tenantId: string,
  input: ProrationInput
): Promise<ProrationResult> {
  const now = input.effectiveAt ?? new Date();

  const subscriber = await db.subscriber.findFirst({
    where: { id: input.subscriberId, tenantId },
    include: { plan: true },
  });
  if (!subscriber) throw new Error("Subscriber not found");

  const newPlan = await db.plan.findFirst({
    where: { id: input.newPlanId, tenantId },
  });
  if (!newPlan) throw new Error("New plan not found");
  if (newPlan.status !== "active") {
    throw new Error(`New plan ${newPlan.name} is not active`);
  }

  const oldPlan = subscriber.plan;

  // Determine the current billing cycle window.
  // If the subscriber has an existing invoice this cycle, anchor to its
  // issue date; otherwise anchor to the 1st of the current month.
  const currentInvoice = await db.invoice.findFirst({
    where: {
      tenantId,
      subscriberId: subscriber.id,
      issueDate: { lte: now },
      status: { in: ["issued", "partial", "overdue"] },
    },
    orderBy: { issueDate: "desc" },
  });

  const cycleStart = currentInvoice?.issueDate
    ? startOfDay(currentInvoice.issueDate)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const cycleEnd = addMonths(cycleStart, 1);

  const daysInCycle = daysBetween(cycleStart, cycleEnd);
  const daysElapsed = Math.min(
    daysBetween(cycleStart, startOfDay(now)),
    daysInCycle
  );
  const daysRemaining = Math.max(0, daysInCycle - daysElapsed);

  const oldPrice = oldPlan?.price.toNumber() ?? 0;
  const newPrice = newPlan.price.toNumber();
  const currency = newPlan.currency;

  const oldCredit = round2((oldPrice * daysRemaining) / daysInCycle);
  const newCharge = round2((newPrice * daysRemaining) / daysInCycle);
  const netAdjustment = round2(newCharge - oldCredit);

  const result: ProrationResult = {
    subscriberId: subscriber.id,
    oldPlanId: oldPlan?.id ?? null,
    oldPlanName: oldPlan?.name ?? null,
    newPlanId: newPlan.id,
    newPlanName: newPlan.name,
    cycleStart,
    cycleEnd,
    daysInCycle,
    daysElapsed,
    daysRemaining,
    oldPrice,
    newPrice,
    oldCredit,
    newCharge,
    netAdjustment,
    currency,
  };

  if (input.dryRun) return result;

  // Persist the plan change on the subscriber
  await db.subscriber.update({
    where: { id: subscriber.id },
    data: { planId: newPlan.id },
  });

  // Sync RADIUS group mapping (radusergroup) so auth picks up new plan attrs
  if (subscriber.username) {
    const newGroupName = `plan-${slugify(newPlan.name)}`;
    await db.radUserGroup.upsert({
      where: { username: subscriber.username },
      create: { username: subscriber.username, groupname: newGroupName, priority: 1 },
      update: { groupname: newGroupName },
    });
    result.newPlanName = newPlan.name;
  }

  if (netAdjustment < 0) {
    // Issue a Credit Note for the refund credit
    const seq = await nextCreditNoteSeq(tenantId);
    const creditNote = await db.creditNote.create({
      data: {
        tenantId,
        number: `CN-${now.getFullYear()}-${String(seq).padStart(4, "0")}`,
        subscriberId: subscriber.id,
        invoiceId: currentInvoice?.id ?? null,
        amount: new Prisma.Decimal(Math.abs(netAdjustment)),
        currency,
        reason: `Proration: plan change ${oldPlan?.name ?? "—"} → ${newPlan.name} (${daysRemaining}/${daysInCycle} days)`,
        status: "issued",
        issuedBy: input.issuedBy,
      },
    });
    result.creditNoteNumber = creditNote.number;
  } else if (netAdjustment > 0 && currentInvoice) {
    // Add a line item to the current open invoice
    const existingItems = currentInvoice.items
      ? (JSON.parse(currentInvoice.items) as any[])
      : [];
    const lineItem = {
      description: `Proration: ${newPlan.name} (${daysRemaining}/${daysInCycle} days)`,
      quantity: 1,
      unitPrice: netAdjustment,
      amount: netAdjustment,
    };
    existingItems.push(lineItem);
    const newSubtotal = round2(
      currentInvoice.subtotal.toNumber() + netAdjustment
    );
    const newTax = round2(newSubtotal * (newPlan.taxRate.toNumber() / 100));
    const newTotal = round2(newSubtotal + newTax);
    await db.invoice.update({
      where: { id: currentInvoice.id },
      data: {
        items: JSON.stringify(existingItems),
        subtotal: new Prisma.Decimal(newSubtotal),
        taxAmount: new Prisma.Decimal(newTax),
        total: new Prisma.Decimal(newTotal),
      },
    });
    result.invoiceLineItemId = currentInvoice.id;
  }

  await eventBus.emit(
    "billing.proration",
    {
      subscriberId: subscriber.id,
      oldPlanId: oldPlan?.id ?? null,
      newPlanId: newPlan.id,
      netAdjustment,
      daysRemaining,
      daysInCycle,
    },
    { tenantId, source: "billing" }
  );

  return result;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
async function nextCreditNoteSeq(tenantId: string): Promise<number> {
  const year = new Date().getFullYear();
  const count = await db.creditNote.count({
    where: {
      tenantId,
      number: { startsWith: `CN-${year}-` },
    },
  });
  return count + 1;
}
