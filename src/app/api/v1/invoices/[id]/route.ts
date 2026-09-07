// =====================================================================
// INVOICE DETAIL API — GET, PATCH (cancel / apply payment)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import {
  getInvoiceById,
  cancelInvoice,
  applyPayment,
} from "@/core/repositories/billing/invoice";

export const dynamic = "force-dynamic";

// GET /api/v1/invoices/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const invoice = await getInvoiceById(ctx.tenantId, id);
  if (!invoice) {
    throw ApiError.notFound("Invoice", id);
  }

  return ok({
    id: invoice.id,
    number: invoice.number,
    subscriberId: invoice.subscriberId,
    subscriber: invoice.subscriber
      ? {
          id: invoice.subscriber.id,
          customerId: invoice.subscriber.customerId,
          name: `${invoice.subscriber.firstName} ${invoice.subscriber.lastName}`,
          email: invoice.subscriber.email,
          plan: invoice.subscriber.plan,
        }
      : null,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subtotal: invoice.subtotal.toNumber(),
    taxAmount: invoice.taxAmount.toNumber(),
    total: invoice.total.toNumber(),
    amountPaid: invoice.amountPaid.toNumber(),
    balanceDue: invoice.total.toNumber() - invoice.amountPaid.toNumber(),
    status: invoice.status,
    currency: invoice.currency,
    lineItems: invoice.items ? JSON.parse(invoice.items) : [],
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amount: p.amount.toNumber(),
      method: p.method,
      receivedAt: p.receivedAt,
    })),
    createdAt: invoice.createdAt,
  });
});

const updateSchema = z.object({
  action: z.enum(["cancel", "apply_payment"]).optional(),
  paymentAmount: z.number().min(0.01).optional(),
  paymentMethod: z.string().optional(),
});

// PATCH /api/v1/invoices/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await getInvoiceById(ctx.tenantId, id);
  if (!existing) {
    throw ApiError.notFound("Invoice", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  if (parsed.data.action === "cancel") {
    try {
      const updated = await cancelInvoice(ctx.tenantId, id);
      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "invoice.cancel",
        module: "billing",
        resource: "Invoice",
        resourceId: id,
        requestId,
        oldValue: { status: existing.status },
        newValue: { status: "cancelled" },
        message: `Cancelled invoice ${existing.number}`,
      });

      await eventBus.emit(
        EVENTS.INVOICE_CANCELLED,
        { invoiceId: id, number: existing.number },
        { tenantId: ctx.tenantId, source: "billing", requestId }
      );

      return ok({ id: updated.id, status: updated.status });
    } catch (err) {
      throw ApiError.businessRule(
        err instanceof Error ? err.message : "Failed to cancel invoice"
      );
    }
  }

  if (parsed.data.action === "apply_payment") {
    if (!parsed.data.paymentAmount) {
      throw ApiError.businessRule("paymentAmount is required for apply_payment action");
    }
    try {
      const { invoice, paymentId } = await applyPayment(
        ctx.tenantId,
        id,
        parsed.data.paymentAmount,
        parsed.data.paymentMethod || "manual"
      );

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "invoice.payment_applied",
        module: "billing",
        resource: "Invoice",
        resourceId: id,
        requestId,
        newValue: { amount: parsed.data.paymentAmount, method: parsed.data.paymentMethod, newStatus: invoice.status },
        message: `Applied ${parsed.data.paymentAmount} to invoice ${invoice.number} (status: ${invoice.status})`,
      });

      if (invoice.status === "paid") {
        await eventBus.emit(
          EVENTS.INVOICE_PAID,
          { invoiceId: id, number: invoice.number, amount: parsed.data.paymentAmount },
          { tenantId: ctx.tenantId, source: "billing", requestId }
        );
      }

      return ok({
        id: invoice.id,
        status: invoice.status,
        amountPaid: invoice.amountPaid.toNumber(),
        balanceDue: invoice.total.toNumber() - invoice.amountPaid.toNumber(),
        paymentId,
      });
    } catch (err) {
      throw ApiError.businessRule(
        err instanceof Error ? err.message : "Failed to apply payment"
      );
    }
  }

  throw ApiError.businessRule("Unknown action. Use 'cancel' or 'apply_payment'.");
});
