// =====================================================================
// PROMOTION APPLY API — apply promo code to invoice (modifies invoice)
// POST /api/v1/promotions/apply
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";

export const dynamic = "force-dynamic";

const applySchema = z.object({
  code: z.string().min(1).max(60),
  invoiceId: z.string().min(1),
});

// POST /api/v1/promotions/apply — apply promotion to invoice
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
  const body = await req.json();
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const { code, invoiceId } = parsed.data;

  // Find and validate promotion
  const promotion = await db.promotion.findUnique({ where: { code: code.toUpperCase() } });
  if (!promotion) throw ApiError.businessRule(`Promotion code "${code}" not found`);

  // Validation checks
  const now = new Date();
  if (promotion.status !== "active") throw ApiError.businessRule(`Promotion is ${promotion.status}`);
  if (now < promotion.validFrom) throw ApiError.businessRule("Promotion hasn't started yet");
  if (now > promotion.validUntil) throw ApiError.businessRule("Promotion has expired");
  if (promotion.maxUses && promotion.usedCount >= promotion.maxUses) throw ApiError.businessRule("Promotion usage limit reached");

  // Find invoice
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, tenantId: ctx.tenantId } });
  if (!invoice) throw ApiError.notFound("Invoice", invoiceId);
  if (invoice.status === "paid") throw ApiError.businessRule("Cannot apply promotion to a paid invoice");

  // Calculate discount
  const subtotal = invoice.subtotal.toNumber();
  let discountAmount = 0;
  if (promotion.type === "percentage") {
    discountAmount = Math.round((subtotal * promotion.value) / 100 * 100) / 100;
  } else if (promotion.type === "flat") {
    discountAmount = Math.min(promotion.value, subtotal);
  } else if (promotion.type === "free_trial") {
    discountAmount = subtotal;
  }

  // === INDUSTRY STANDARD: Actually modify the invoice ===
  const newTotal = invoice.total.toNumber() - discountAmount;
  const newBalance = newTotal - invoice.amountPaid.toNumber();

  const updated = await db.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotal: new Prisma.Decimal(subtotal - discountAmount),
      total: new Prisma.Decimal(newTotal),
    },
  });

  // Increment promotion usage
  await db.promotion.update({
    where: { id: promotion.id },
    data: { usedCount: { increment: 1 } },
  });

  // If usage limit reached, mark as depleted
  if (promotion.maxUses && promotion.usedCount + 1 >= promotion.maxUses) {
    await db.promotion.update({
      where: { id: promotion.id },
      data: { status: "depleted" },
    });
  }

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "promotion.apply",
    module: "billing", resource: "Invoice", resourceId: invoiceId, requestId,
    oldValue: { subtotal: invoice.subtotal.toNumber(), total: invoice.total.toNumber() },
    newValue: { subtotal: updated.subtotal.toNumber(), total: updated.total.toNumber(), discount: discountAmount, promotionCode: promotion.code },
    message: `Applied promotion ${promotion.code} (${promotion.type}: ${promotion.value}) to invoice ${invoice.number} — discount: $${discountAmount.toFixed(2)}`,
  });

  await eventBus.emit(EVENTS.INVOICE_UPDATED, { invoiceId, promotionCode: promotion.code, discountAmount }, { tenantId: ctx.tenantId, source: "billing", requestId });

  return ok({
    applied: true,
    promotionCode: promotion.code,
    promotionName: promotion.name,
    discountType: promotion.type,
    discountValue: promotion.value,
    discountAmount,
    invoice: {
      number: updated.number,
      newSubtotal: updated.subtotal.toNumber(),
      newTotal: updated.total.toNumber(),
      newBalance,
    },
    promotionRemaining: promotion.maxUses ? promotion.maxUses - (promotion.usedCount + 1) : null,
  });
});
