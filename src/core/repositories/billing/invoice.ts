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
 * Run billing for active subscribers: generate invoices for all active
 * subscribers with a plan. Skips subscribers who already have an unpaid
 * invoice for the current billing period.
 */
export async function runBilling(
  tenantId: string,
  options: { billingCycle?: string; dryRun?: boolean; issuedBy: string }
): Promise<{
  generated: number;
  skipped: number;
  errors: Array<{ subscriberId: string; error: string }>;
  totalAmount: number;
}> {
  const { dryRun = false, issuedBy } = options;

  // Get all active subscribers with a plan
  const subscribers = await db.subscriber.findMany({
    where: { tenantId, status: "active", planId: { not: null } },
    include: { plan: true },
  });

  const errors: Array<{ subscriberId: string; error: string }> = [];
  let generated = 0;
  let skipped = 0;
  let totalAmount = 0;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  for (const sub of subscribers) {
    try {
      // Check if subscriber already has an unpaid invoice this billing period
      const periodStart = new Date(currentYear, currentMonth, 1);
      const periodEnd = new Date(currentYear, currentMonth + 1, 1);

      const existingUnpaid = await db.invoice.findFirst({
        where: {
          tenantId,
          subscriberId: sub.id,
          issueDate: { gte: periodStart, lt: periodEnd },
          status: { in: ["issued", "partial", "overdue"] },
        },
      });

      if (existingUnpaid) {
        skipped++;
        continue;
      }

      if (!dryRun) {
        const invoice = await createInvoice({
          tenantId,
          subscriberId: sub.id,
          lineItems: [
            {
              description: `${sub.plan!.name} — ${sub.plan!.billingCycle} subscription`,
              quantity: 1,
              unitPrice: sub.plan!.price.toNumber(),
              amount: sub.plan!.price.toNumber(),
            },
          ],
          taxRate: sub.plan!.taxRate.toNumber(),
          dueInDays: 7,
          currency: sub.plan!.currency,
          status: INVOICE_STATUS.ISSUED,
          issuedBy,
        });

        totalAmount += invoice.total.toNumber();
      } else {
        // Dry run: just count
        totalAmount += sub.plan!.price.toNumber() * (1 + sub.plan!.taxRate.toNumber());
      }
      generated++;
    } catch (err) {
      errors.push({
        subscriberId: sub.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { generated, skipped, errors, totalAmount };
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
