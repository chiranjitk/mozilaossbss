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

  // === INDUSTRY STANDARD: Loyalty points earning + Referral reward ===
  if (data.subscriberId) {
    // 1. Award loyalty points (1 point per 100 currency units)
    const pointsToAward = Math.floor(data.amount / 100);
    if (pointsToAward > 0) {
      const loyalty = await db.loyaltyMember.findFirst({
        where: { subscriberId: data.subscriberId },
      });

      if (loyalty) {
        const newPoints = loyalty.points + pointsToAward;
        const newTotalEarned = loyalty.totalEarned + pointsToAward;

        // Auto tier progression
        let newTier = loyalty.tier;
        if (newTotalEarned >= 10000) newTier = "platinum";
        else if (newTotalEarned >= 5000) newTier = "gold";
        else if (newTotalEarned >= 1000) newTier = "silver";

        await db.loyaltyMember.update({
          where: { id: loyalty.id },
          data: {
            points: newPoints,
            totalEarned: newTotalEarned,
            tier: newTier,
          },
        });
      } else {
        // Auto-enroll in loyalty program on first payment
        await db.loyaltyMember.create({
          data: {
            tenantId: ctx.tenantId,
            subscriberId: data.subscriberId,
            points: pointsToAward,
            totalEarned: pointsToAward,
            tier: "bronze",
          },
        }).catch(() => {}); // Ignore if already exists
      }
    }

    // 2. Check for pending referral rewards
    const referral = await db.referral.findFirst({
      where: { refereeId: data.subscriberId, status: "pending" },
    });

    if (referral) {
      // Mark referral as completed
      await db.referral.update({
        where: { id: referral.id },
        data: { status: "completed", completedAt: new Date() },
      });

      // Award referral reward to referrer
      if (referral.referrerId) {
        const referrerLoyalty = await db.loyaltyMember.findFirst({
          where: { subscriberId: referral.referrerId },
        });

        if (referrerLoyalty) {
          const bonusPoints = Math.floor(referral.rewardValue * 10); // 10x reward as points
          await db.loyaltyMember.update({
            where: { id: referrerLoyalty.id },
            data: {
              points: { increment: bonusPoints },
              totalEarned: { increment: bonusPoints },
            },
          });
        }

        // Create ActionHistory for referral completion
        await db.actionHistory.create({
          data: {
            tenantId: ctx.tenantId,
            subscriberId: referral.referrerId,
            action: "note_add",
            performedBy: ctx.userId,
            notes: `Referral reward: ${referral.rewardType} ${referral.rewardValue} for referring subscriber`,
          },
        }).catch(() => {});
      }
    }

    // 3. If invoice is now fully paid, auto-reactivate subscriber if suspended
    if (data.invoiceId) {
      const updatedInvoice = await db.invoice.findFirst({
        where: { id: data.invoiceId, tenantId: ctx.tenantId },
      });
      if (updatedInvoice?.status === "paid" && updatedInvoice.subscriberId) {
        const sub = await db.subscriber.findFirst({
          where: { id: updatedInvoice.subscriberId, status: "suspended" },
        });
        if (sub) {
          // Auto-reactivate: remove RADIUS reject + restore access
          const { transitionSubscriberStatus } = await import("@/core/repositories/subscriber");
          await transitionSubscriberStatus(ctx.tenantId, sub.id, "active" as any, ctx.userId);

          await db.actionHistory.create({
            data: {
              tenantId: ctx.tenantId,
              subscriberId: sub.id,
              action: "activate",
              performedBy: ctx.userId,
              notes: "Auto-reactivated after payment received",
            },
          }).catch(() => {});
        }
      }
    }
  }

  return created({ id: payment.id, number, amount: data.amount, status: payment.status }, requestId);
});
