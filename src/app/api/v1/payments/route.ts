// =====================================================================
// PAYMENTS API — list + record manual payment
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/payments
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const method = url.searchParams.get("method");
  const gateway = url.searchParams.get("gateway");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(method && method !== "all" ? { method } : {}),
    ...(gateway && gateway !== "all" ? { gateway } : {}),
    ...(search ? {
      OR: [
        { number: { contains: search } },
        { gatewayRef: { contains: search } },
        { subscriber: { customerId: { contains: search } } },
        { subscriber: { firstName: { contains: search } } },
        { subscriber: { lastName: { contains: search } } },
      ],
    } : {}),
  };

  const [payments, total] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true } },
        invoice: { select: { id: true, number: true } },
      },
    }),
    db.payment.count({ where }),
  ]);

  return paginated(
    payments.map((p) => ({
      id: p.id,
      number: p.number,
      amount: p.amount.toNumber(),
      currency: p.currency,
      method: p.method,
      gateway: p.gateway,
      gatewayRef: p.gatewayRef,
      status: p.status,
      reconciled: p.reconciled,
      notes: p.notes,
      receivedAt: p.receivedAt,
      subscriber: p.subscriber
        ? { customerId: p.subscriber.customerId, name: `${p.subscriber.firstName} ${p.subscriber.lastName}` }
        : null,
      invoice: p.invoice ? { number: p.invoice.number } : null,
    })),
    { page, pageSize, total },
    requestId
  );
});

const recordPaymentSchema = z.object({
  invoiceId: z.string().optional(),
  subscriberId: z.string().optional(),
  amount: z.number().min(0.01, "Amount must be > 0"),
  currency: z.string().default("USD"),
  method: z.enum(["cash", "card", "bank", "upi", "wallet", "gateway", "manual"]).default("manual"),
  gateway: z.string().optional(),
  gatewayRef: z.string().optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

// POST /api/v1/payments — record a manual payment
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.create");
  const body = await req.json();
  const parsed = recordPaymentSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data = parsed.data;

  // Generate payment number
  const year = new Date().getFullYear();
  const count = await db.payment.count({ where: { number: { startsWith: `PAY-${year}-` } } });
  const number = `PAY-${year}-${String(count + 1).padStart(4, "0")}`;

  const payment = await db.payment.create({
    data: {
      tenantId: ctx.tenantId,
      number,
      invoiceId: data.invoiceId || null,
      subscriberId: data.subscriberId || null,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      gateway: data.gateway || null,
      gatewayRef: data.gatewayRef || null,
      status: "completed",
      notes: data.notes || null,
    },
  });

  // If linked to invoice, apply payment to invoice
  if (data.invoiceId) {
    const invoice = await db.invoice.findFirst({ where: { id: data.invoiceId, tenantId: ctx.tenantId } });
    if (invoice) {
      const newPaidCents = Math.round((invoice.amountPaid.toNumber() + data.amount) * 100);
      const totalCents = Math.round(invoice.total.toNumber() * 100);
      const newStatus = newPaidCents >= totalCents ? "paid" : newPaidCents > 0 ? "partial" : invoice.status;
      await db.invoice.update({
        where: { id: data.invoiceId },
        data: { amountPaid: invoice.amountPaid.toNumber() + data.amount, status: newStatus },
      });

      if (newStatus === "paid") {
        await eventBus.emit(EVENTS.INVOICE_PAID, { invoiceId: invoice.id, number: invoice.number, amount: data.amount }, { tenantId: ctx.tenantId, source: "payments", requestId });
      }
    }
  }

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "payment.record",
    module: "payments", resource: "Payment", resourceId: payment.id, requestId,
    newValue: { number, amount: data.amount, method: data.method, gateway: data.gateway },
    message: `Recorded payment ${number} (${data.currency} ${data.amount} via ${data.method})`,
  });

  await eventBus.emit(EVENTS.PAYMENT_RECEIVED, { paymentId: payment.id, number, amount: data.amount, method: data.method }, { tenantId: ctx.tenantId, source: "payments", requestId });

  return created({ id: payment.id, number, amount: data.amount, status: payment.status }, requestId);
});
