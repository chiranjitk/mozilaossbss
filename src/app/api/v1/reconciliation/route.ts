// =====================================================================
// RECONCILIATION API — match payments to invoices, mark reconciled
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/reconciliation — list unreconciled payments + summary
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.reconcile");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const filter = url.searchParams.get("filter") ?? "unreconciled";

  const where = {
    tenantId: ctx.tenantId,
    ...(filter === "unreconciled" ? { reconciled: false } : filter === "reconciled" ? { reconciled: true } : {}),
  };

  const [payments, total, summary] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscriber: { select: { customerId: true, firstName: true, lastName: true } },
        invoice: { select: { number: true, total: true, amountPaid: true } },
      },
    }),
    db.payment.count({ where }),
    db.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { tenantId: ctx.tenantId, reconciled: false, status: "completed" },
    }),
  ]);

  const totalReconciled = await db.payment.aggregate({
    _sum: { amount: true },
    _count: true,
    where: { tenantId: ctx.tenantId, reconciled: true, status: "completed" },
  });

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
      reconciledAt: p.reconciledAt,
      notes: p.notes,
      receivedAt: p.receivedAt,
      subscriber: p.subscriber
        ? { customerId: p.subscriber.customerId, name: `${p.subscriber.firstName} ${p.subscriber.lastName}` }
        : null,
      invoice: p.invoice
        ? { number: p.invoice.number, total: p.invoice.total.toNumber(), amountPaid: p.invoice.amountPaid.toNumber() }
        : null,
    })),
    { page, pageSize, total },
    requestId
  );
});

const reconcileSchema = z.object({
  action: z.enum(["reconcile", "unreconcile"]),
  paymentIds: z.array(z.string()).min(1, "At least one payment ID required"),
});

// POST /api/v1/reconciliation — mark payments as reconciled/unreconciled
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.reconcile");
  const body = await req.json();
  const parsed = reconcileSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  const { action, paymentIds } = parsed.data;
  const reconciled = action === "reconcile";
  const reconciledAt = reconciled ? new Date() : null;

  const result = await db.payment.updateMany({
    where: {
      id: { in: paymentIds },
      tenantId: ctx.tenantId,
      status: "completed",
    },
    data: { reconciled, reconciledAt },
  });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: `payment.${action}`,
    module: "payments", resource: "Payment", requestId,
    newValue: { count: result.count, reconciled },
    message: `${action === "reconcile" ? "Reconciled" : "Unreconciled"} ${result.count} payment(s)`,
  });

  return ok({ updated: result.count, action, reconciled });
});
