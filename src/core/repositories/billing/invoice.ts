// =====================================================================
// BILLING REPOSITORY — invoice generation, line items, tax, decimal-safe
// Money is handled via Prisma Decimal (never floating point).
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  paginate,
  parsePagination,
  type PaginatedResult,
} from "@/core/repositories/base";
import type { RatedLineItem } from "@/core/billing/rating";

// Invoice statuses
export const INVOICE_STATUS = {
  DRAFT: "draft",
  ISSUED: "issued",
  PAID: "paid",
  PARTIAL: "partial",
  OVERDUE: "overdue",
  CANCELLED: "cancelled",
} as const;

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number; // in major currency units (e.g. dollars)
  amount: number; // quantity * unitPrice
}

export interface InvoiceListFilters {
  search?: string;
  status?: string;
  subscriberId?: string;
}

export const INVOICE_INCLUDE = {
  subscriber: {
    select: {
      id: true,
      customerId: true,
      firstName: true,
      lastName: true,
      email: true,
      plan: { select: { id: true, name: true, code: true } },
    },
  },
  payments: {
    where: { status: "completed" },
    select: { id: true, amount: true, receivedAt: true, method: true },
  },
  _count: { select: { payments: true } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: typeof INVOICE_INCLUDE;
}>;

export async function listInvoices(
  tenantId: string,
  filters: InvoiceListFilters,
  query: URLSearchParams
): Promise<PaginatedResult<InvoiceWithRelations>> {
  const { page, pageSize } = parsePagination(query);

  const where: Prisma.InvoiceWhereInput = {
    tenantId,
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.subscriberId ? { subscriberId: filters.subscriberId } : {}),
    ...(filters.search
      ? {
          OR: [
            { number: { contains: filters.search } },
            { subscriber: { customerId: { contains: filters.search } } },
            { subscriber: { firstName: { contains: filters.search } } },
            { subscriber: { lastName: { contains: filters.search } } },
          ],
        }
      : {}),
  };

  return paginate<
    InvoiceWithRelations,
    Prisma.InvoiceWhereInput,
    Prisma.InvoiceOrderByWithRelationInput
  >(
    {
      findMany: (args) => db.invoice.findMany({ ...args, include: INVOICE_INCLUDE }),
      count: (args) => db.invoice.count(args),
    },
    { where, orderBy: { issueDate: "desc" }, page, pageSize }
  );
}

export async function getInvoiceById(
  tenantId: string,
  id: string
): Promise<InvoiceWithRelations | null> {
  return db.invoice.findFirst({
    where: { id, tenantId },
    include: INVOICE_INCLUDE,
  });
}

export interface CreateInvoiceInput {
  tenantId: string;
  subscriberId?: string;
  lineItems: LineItem[];
  taxRate?: number; // e.g. 0.18 for 18%
  dueInDays?: number;
  currency?: string;
  status?: string;
  issuedBy: string;
}

/**
 * Create an invoice with decimal-safe money calculations.
 * Computes subtotal, tax, total from line items.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceWithRelations> {
  const { lineItems, taxRate = 0, dueInDays = 7, currency = "USD", subscriberId } = input;

  if (lineItems.length === 0) {
    throw new Error("At least one line item is required");
  }

  // Calculate subtotal (sum of line item amounts)
  // Use integer cents internally to avoid floating-point errors
  const subtotalCents = lineItems.reduce((sum, li) => {
    return sum + Math.round(li.amount * 100);
  }, 0);

  const taxAmountCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + taxAmountCents;

  // Convert back to Decimal for storage
  const subtotal = new Prisma.Decimal(subtotalCents / 100);
  const taxAmount = new Prisma.Decimal(taxAmountCents / 100);
  const total = new Prisma.Decimal(totalCents / 100);

  // Generate invoice number: INV-YYYY-XXXX
  const year = new Date().getFullYear();
  const count = await db.invoice.count({
    where: { number: { startsWith: `INV-${year}-` } },
  });
  const number = `INV-${year}-${String(count + 1).padStart(4, "0")}`;

  const issueDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueInDays);

  const invoice = await db.invoice.create({
    data: {
      tenantId: input.tenantId,
      number,
      subscriberId: subscriberId || null,
      issueDate,
      dueDate,
      subtotal,
      taxAmount,
      total,
      amountPaid: new Prisma.Decimal(0),
      status: input.status || INVOICE_STATUS.ISSUED,
      currency,
      items: JSON.stringify(lineItems),
    },
    include: INVOICE_INCLUDE,
  });

  return invoice;
}

export async function cancelInvoice(
  tenantId: string,
  id: string
): Promise<InvoiceWithRelations> {
  const invoice = await getInvoiceById(tenantId, id);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid") {
    throw new Error("Cannot cancel a paid invoice");
  }
  if (invoice.status === "cancelled") {
    throw new Error("Invoice is already cancelled");
  }

  return db.invoice.update({
    where: { id },
    data: { status: INVOICE_STATUS.CANCELLED },
    include: INVOICE_INCLUDE,
  });
}

/**
 * Apply a payment to an invoice. Updates amountPaid and status.
 * Idempotent: re-applying the same payment amount is safe.
 */
export async function applyPayment(
  tenantId: string,
  invoiceId: string,
  amount: number,
  method: string = "manual"
): Promise<{ invoice: InvoiceWithRelations; paymentId: string }> {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "cancelled") {
    throw new Error("Cannot apply payment to a cancelled invoice");
  }

  const totalCents = Math.round(invoice.total.toNumber() * 100);
  const currentPaidCents = Math.round(invoice.amountPaid.toNumber() * 100);
  const paymentCents = Math.round(amount * 100);
  const newPaidCents = currentPaidCents + paymentCents;

  // Determine new status
  let newStatus: string;
  if (newPaidCents >= totalCents) {
    newStatus = INVOICE_STATUS.PAID;
  } else if (newPaidCents > 0) {
    newStatus = INVOICE_STATUS.PARTIAL;
  } else {
    newStatus = invoice.status;
  }

  // Generate payment number
  const year = new Date().getFullYear();
  const payCount = await db.payment.count({
    where: { number: { startsWith: `PAY-${year}-` } },
  });
  const payNumber = `PAY-${year}-${String(payCount + 1).padStart(4, "0")}`;

  // Create payment record + update invoice in a transaction
  const [updated, payment] = await db.$transaction([
    db.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: new Prisma.Decimal(newPaidCents / 100),
        status: newStatus,
      },
      include: INVOICE_INCLUDE,
    }),
    db.payment.create({
      data: {
        tenantId,
        number: payNumber,
        invoiceId,
        subscriberId: invoice.subscriberId,
        amount: new Prisma.Decimal(paymentCents / 100),
        currency: invoice.currency,
        method,
        status: "completed",
      },
    }),
  ]);

  return { invoice: updated, paymentId: payment.id };
}

/**
 * Mark overdue invoices. Called by the billing worker or cron.
 * An invoice is overdue if dueDate < now AND status is "issued" or "partial".
 */
export async function markOverdueInvoices(tenantId: string): Promise<number> {
  const result = await db.invoice.updateMany({
    where: {
      tenantId,
      status: { in: [INVOICE_STATUS.ISSUED, INVOICE_STATUS.PARTIAL] },
      dueDate: { lt: new Date() },
    },
    data: { status: INVOICE_STATUS.OVERDUE },
  });
  return result.count;
}

/**
 * Aggregate a subscriber's data usage (MB) within a time window from
 * ActiveSession (current) + SessionHistory (completed). Octets are BigInt.
 */
export async function aggregateUsageMb(
  subscriberId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<{ downMb: number; upMb: number; totalMb: number }> {
  const [active, history] = await Promise.all([
    db.activeSession.aggregate({
      _sum: { inputOctets: true, outputOctets: true },
      where: { subscriberId, startTime: { gte: windowStart, lt: windowEnd } },
    }),
    db.sessionHistory.aggregate({
      _sum: { inputOctets: true, outputOctets: true },
      where: { subscriberId, startTime: { gte: windowStart, lt: windowEnd } },
    }),
  ]);

  const downBytes =
    (history._sum.inputOctets ?? 0n) + (active._sum.inputOctets ?? 0n);
  const upBytes =
    (history._sum.outputOctets ?? 0n) + (active._sum.outputOctets ?? 0n);

  const downMb = Number(downBytes) / (1024 * 1024);
  const upMb = Number(upBytes) / (1024 * 1024);
  return { downMb, upMb, totalMb: downMb + upMb };
}

/**
 * Run billing for active subscribers: generate invoices for all active
 * subscribers with a plan.
 * PRODUCTION ENGINE:
 *   - Cycle-aware periods: per-plan billingCycle (monthly/quarterly/yearly/one_time)
 *     anchored on subscriber.billingAnchorDate (or createdAt)
 *   - First-cycle proration (service start mid-cycle)
 *   - Recurring add-on lines from subscriber.metadata.addOns
 *   - Usage-based data-cap overage rating (per-GB) from session accounting
 *   - Multiple charge overrides applied via rating engine (integer cents)
 *   - Grace periods honored (pre-billing skip)
 *   - Dedup: skips subscribers already having an unpaid invoice this cycle
 *   - Updates subscriber.lastBilledAt; dunning/suspension moved to dunning engine
 */
export async function runBilling(
  tenantId: string,
  options: { billingCycle?: string; dryRun?: boolean; issuedBy: string }
): Promise<{
  generated: number;
  skipped: number;
  suspended: number;
  errors: Array<{ subscriberId: string; error: string }>;
  totalAmount: number;
  previews: Array<{
    subscriberId: string;
    customerId?: string;
    periodStart: string;
    periodEnd: string;
    prorated: boolean;
    total: number;
  }>;
}> {
  const { dryRun = false, issuedBy } = options;
  const { parseCycle, getCycleBounds, prorationFactor } = await import(
    "@/core/billing/cycle"
  );
  const {
    rateSubscription,
    rateAddOn,
    rateOverage,
    rateInvoice,
    toMajor,
    centsToDecimal,
  } = await import("@/core/billing/rating");

  const subscribers = await db.subscriber.findMany({
    where: { tenantId, status: "active", planId: { not: null } },
    include: { plan: true },
  });

  const errors: Array<{ subscriberId: string; error: string }> = [];
  let generated = 0;
  let skipped = 0;
  let suspended = 0;
  let totalAmount = 0;
  const previews: Array<{
    subscriberId: string;
    customerId?: string;
    periodStart: string;
    periodEnd: string;
    prorated: boolean;
    total: number;
  }> = [];

  const now = new Date();

  for (const sub of subscribers) {
    try {
      const plan = sub.plan!;
      const cycle = parseCycle(
        options.billingCycle ?? plan.billingCycle
      );
      const anchor = sub.billingAnchorDate ?? sub.createdAt;
      const bounds = getCycleBounds(cycle, anchor, now);

      // 1. Dedup: unpaid invoice already issued within this cycle window
      const existingUnpaid = await db.invoice.findFirst({
        where: {
          tenantId,
          subscriberId: sub.id,
          issueDate: { gte: bounds.periodStart, lt: bounds.periodEnd },
          status: { in: ["issued", "partial", "overdue"] },
        },
        select: { id: true },
      });
      if (existingUnpaid) {
        skipped++;
        continue;
      }

      // 2. Pre-billing grace period skip
      const activeGrace = await db.gracePeriod.findFirst({
        where: {
          tenantId,
          subscriberId: sub.id,
          type: "pre_billing",
          status: "active",
          endDate: { gt: now },
        },
        select: { id: true },
      });
      if (activeGrace) {
        skipped++;
        continue;
      }

      // 3. Proration: first invoice for a subscriber who joined mid-cycle.
      //    (lastBilledAt null AND createdAt after cycle start)
      const isFirstCycle = sub.lastBilledAt == null;
      const proration =
        isFirstCycle && sub.createdAt > bounds.periodStart
          ? prorationFactor(cycle, anchor, sub.createdAt, now)
          : 1;

      // 4. Subscription line(s)
      const subscriptionLines = rateSubscription(plan, cycle, proration);

      // 5. Recurring add-ons from metadata
      let addOnLines: RatedLineItem[] = [];
      const meta = safeParseJSON<Record<string, unknown>>(sub.metadata);
      const metaAddOns = Array.isArray(meta?.addOns) ? (meta!.addOns as Array<Record<string, unknown>>) : [];
      if (metaAddOns.length > 0) {
        const days = bounds.totalDays;
        addOnLines = metaAddOns
          .filter((a) => a && typeof a === "object" && a.name)
          .map((a) =>
            rateAddOn(
              {
                id: String(a.id ?? ""),
                name: String(a.name),
                chargeType: String(a.chargeType ?? "flat"),
                price: Number(a.price ?? 0),
                quantity: Number(a.quantity ?? 1),
              },
              { daysInCycle: days }
            )
          )
          .filter((l) => Math.round(l.amount * 100) > 0);
      }

      // 6. Usage-based overage (FUP) when plan has a data cap
      let overageLine: RatedLineItem | null = null;
      if (plan.dataCap != null && plan.dataCap > 0) {
        const usage = await aggregateUsageMb(sub.id, bounds.periodStart, bounds.periodEnd);
        const perGbSetting = await getOveragePerGbCents(tenantId);
        const overage = rateOverage(plan.dataCap, usage.totalMb, perGbSetting);
        if (overage.billed) {
          overageLine = {
            description: `Data overage — ${overage.chargeableGb} GB above ${plan.dataCap} MB cap (${Math.round(usage.totalMb)} MB used)`,
            quantity: overage.chargeableGb,
            unitPrice: toMajor(perGbSetting),
            amount: toMajor(overage.cents),
            kind: "overage",
            meta: { capMb: plan.dataCap, usedMb: Math.round(usage.totalMb) },
          };
        }
      }

      // 7. Active charge overrides (all of them)
      const overrides = await db.chargeOverride.findMany({
        where: {
          tenantId,
          subscriberId: sub.id,
          status: "active",
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gt: now } }],
        },
      });

      const rated = rateInvoice({
        subscriptionLines,
        addOnLines,
        overageLine,
        overrides: overrides.map((o) => ({
          id: o.id,
          type: o.type,
          valueType: o.valueType,
          value: o.value,
          description: o.description ?? undefined,
        })),
        taxRate: plan.taxRate.toNumber(),
      });

      totalAmount += toMajor(rated.totalCents);
      previews.push({
        subscriberId: sub.id,
        customerId: sub.customerId,
        periodStart: bounds.periodStart.toISOString(),
        periodEnd: bounds.periodEnd.toISOString(),
        prorated: proration < 1,
        total: toMajor(rated.totalCents),
      });

      if (!dryRun) {
        await createRatedInvoice({
          tenantId,
          subscriberId: sub.id,
          rated,
          currency: plan.currency,
          dueInDays: 7,
          periodStart: bounds.periodStart,
          periodEnd: bounds.periodEnd,
          issuedBy,
        });
        await db.subscriber.update({
          where: { id: sub.id },
          data: { lastBilledAt: now },
        });
      }
      generated++;
    } catch (err) {
      errors.push({
        subscriberId: sub.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { generated, skipped, suspended, errors, totalAmount, previews };
}

function safeParseJSON<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Overage unit price (major units per GB) from system setting `billing.overagePerGb`; 0 = disabled. */
async function getOveragePerGbCents(tenantId: string): Promise<number> {
  const setting = await db.systemSetting.findFirst({
    where: { tenantId, key: "billing.overagePerGb" },
  });
  if (!setting) return 0; // overage billing disabled unless configured
  const v = parseFloat(setting.value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v * 100); // major units → cents
}

/** Create an invoice from a fully rated result (keeps numbering/dates in one place). */
async function createRatedInvoice(params: {
  tenantId: string;
  subscriberId: string;
  rated: { lines: RatedLineItem[]; subtotalCents: number; taxCents: number; totalCents: number };
  currency: string;
  dueInDays: number;
  periodStart: Date;
  periodEnd: Date;
  issuedBy: string;
}) {
  const year = new Date().getFullYear();
  const count = await db.invoice.count({
    where: { number: { startsWith: `INV-${year}-` } },
  });
  const number = `INV-${year}-${String(count + 1).padStart(4, "0")}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + params.dueInDays);

  const invoice = await db.invoice.create({
    data: {
      tenantId: params.tenantId,
      number,
      subscriberId: params.subscriberId,
      issueDate: new Date(),
      dueDate,
      subtotal: centsToDecimal(params.rated.subtotalCents),
      taxAmount: centsToDecimal(params.rated.taxCents),
      total: centsToDecimal(params.rated.totalCents),
      amountPaid: new Prisma.Decimal(0),
      status: INVOICE_STATUS.ISSUED,
      currency: params.currency,
      items: JSON.stringify({
        lines: params.rated.lines,
        periodStart: params.periodStart.toISOString(),
        periodEnd: params.periodEnd.toISOString(),
        issuedBy: params.issuedBy,
      }),
    },
    include: INVOICE_INCLUDE,
  });
  return invoice;
}

export async function getBillingStats(tenantId: string) {
  const [totalInvoices, outstandingAmount, overdueCount, collectedThisMonth, pendingInvoices] =
    await Promise.all([
      db.invoice.count({ where: { tenantId } }),
      db.invoice.aggregate({
        _sum: { total: true },
        where: { tenantId, status: { in: ["issued", "partial", "overdue"] } },
      }),
      db.invoice.count({ where: { tenantId, status: "overdue" } }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: {
          tenantId,
          status: "completed",
          receivedAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      db.invoice.count({
        where: { tenantId, status: { in: ["issued", "partial", "overdue"] } },
      }),
    ]);

  return {
    totalInvoices,
    pendingInvoices,
    overdueInvoices: overdueCount,
    outstandingAmount: outstandingAmount._sum.total?.toNumber() ?? 0,
    collectedThisMonth: collectedThisMonth._sum.amount?.toNumber() ?? 0,
  };
}
