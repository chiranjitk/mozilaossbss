// =====================================================================
// CREDIT NOTES API — list, create (refunds / adjustments on invoices)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/credit-notes
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: search } },
            { reason: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, total, invoices] = await Promise.all([
    db.creditNote.findMany({
      where,
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.creditNote.count({ where }),
    db.invoice.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, number: true, subscriberId: true },
    }),
  ]);

  // Fetch subscribers for those invoices (for display)
  const subscriberIds = Array.from(
    new Set(invoices.map((i) => i.subscriberId).filter(Boolean) as string[])
  );
  const subscribers = await db.subscriber.findMany({
    where: { id: { in: subscriberIds } },
    select: { id: true, customerId: true, firstName: true, lastName: true },
  });

  const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
  const subscriberMap = new Map(subscribers.map((s) => [s.id, s]));

  return paginated(
    rows.map((r) => {
      const inv = invoiceMap.get(r.invoiceId);
      const sub = inv?.subscriberId ? subscriberMap.get(inv.subscriberId) : null;
      return {
        id: r.id,
        invoiceId: r.invoiceId,
        invoiceNumber: inv?.number ?? null,
        number: r.number,
        amount: r.amount,
        reason: r.reason,
        status: r.status,
        issuedBy: r.issuedBy,
        issuedAt: r.issuedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        subscriber: sub,
      };
    }),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required"),
  number: z.string().min(2, "Credit note number is required").max(60),
  amount: z.number().min(0.01, "Amount must be greater than zero"),
  reason: z.string().max(500).optional().or(z.literal("")),
  status: z.enum(["issued", "applied", "cancelled"]).default("issued"),
});

// POST /api/v1/credit-notes
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.create");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Validate invoice exists
  const invoice = await db.invoice.findFirst({
    where: { id: data.invoiceId, tenantId: ctx.tenantId },
    select: { id: true, number: true, subscriberId: true, total: true },
  });
  if (!invoice) {
    throw ApiError.businessRule("Selected invoice does not exist");
  }

  // Number uniqueness (global — schema @unique)
  const existing = await db.creditNote.findUnique({ where: { number: data.number } });
  if (existing) {
    throw ApiError.duplicate("Credit note", "number", data.number);
  }

  // Sanity: cannot exceed invoice total
  if (data.amount > Number(invoice.total)) {
    throw ApiError.businessRule(
      `Credit amount (${data.amount}) exceeds invoice total (${Number(invoice.total)})`
    );
  }

  const note = await db.creditNote.create({
    data: {
      tenantId: ctx.tenantId,
      invoiceId: data.invoiceId,
      number: data.number,
      amount: data.amount,
      reason: data.reason || null,
      status: data.status,
      issuedBy: ctx.userId,
    },
  });

  // === INDUSTRY STANDARD: Actually adjust invoice balance ===
  // When a credit note is issued, reduce the invoice's amountPaid by the credit amount
  // (effectively a refund/adjustment). If balance reaches 0, mark invoice as paid.
  const invoiceFull = await db.invoice.findFirst({
    where: { id: data.invoiceId, tenantId: ctx.tenantId },
  });

  if (invoiceFull && data.status === "applied") {
    const newAmountPaid = Math.max(0, invoiceFull.amountPaid.toNumber() - data.amount);
    const newBalance = invoiceFull.total.toNumber() - newAmountPaid;
    const newStatus = newBalance <= 0 ? "paid" : invoiceFull.status;

    await db.invoice.update({
      where: { id: data.invoiceId },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus,
      },
    });

    await eventBus.emit(EVENTS.INVOICE_UPDATED, {
      invoiceId: data.invoiceId,
      creditNoteAmount: data.amount,
      newBalance,
      newStatus,
    }, { tenantId: ctx.tenantId, source: "billing", requestId });
  } else if (invoiceFull && data.status === "issued") {
    // Auto-apply: immediately reduce the invoice total
    const newTotal = invoiceFull.total.toNumber() - data.amount;
    await db.invoice.update({
      where: { id: data.invoiceId },
      data: {
        total: newTotal,
      },
    });

    // Mark credit note as applied
    await db.creditNote.update({
      where: { id: note.id },
      data: { status: "applied" },
    });

    await eventBus.emit(EVENTS.INVOICE_UPDATED, {
      invoiceId: data.invoiceId,
      creditNoteAmount: data.amount,
      newTotal,
    }, { tenantId: ctx.tenantId, source: "billing", requestId });
  }

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "credit_note.create",
    module: "billing",
    resource: "CreditNote",
    resourceId: note.id,
    requestId,
    newValue: { invoiceId: note.invoiceId, number: note.number, amount: note.amount, reason: note.reason },
    message: `Issued credit note ${note.number} ($${note.amount}) against invoice ${invoice.number} → invoice total adjusted`,
  });

  return created(
    {
      id: note.id,
      invoiceId: note.invoiceId,
      number: note.number,
      amount: note.amount,
      status: note.status,
      issuedAt: note.issuedAt.toISOString(),
      invoiceAdjusted: true,
    },
    requestId
  );
});
