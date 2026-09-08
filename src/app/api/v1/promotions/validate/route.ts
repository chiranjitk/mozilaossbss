// =====================================================================
// PROMOTION VALIDATE & APPLY API
// POST /api/v1/promotions/validate — validate a promo code and return discount
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const validateSchema = z.object({
  code: z.string().min(1).max(60),
  invoiceId: z.string().optional(),
  planId: z.string().optional(),
});

// POST /api/v1/promotions/validate
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const body = await req.json();
  const parsed = validateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const { code, invoiceId, planId } = parsed.data;

  // Find the promotion
  const promotion = await db.promotion.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (!promotion) {
    throw ApiError.businessRule(`Promotion code "${code}" not found`);
  }

  // === INDUSTRY STANDARD: Real validation logic ===
  const now = new Date();
  const errors: string[] = [];

  if (promotion.status !== "active") errors.push(`Promotion is ${promotion.status}`);
  if (now < promotion.validFrom) errors.push("Promotion hasn't started yet");
  if (now > promotion.validUntil) errors.push("Promotion has expired");
  if (promotion.maxUses && promotion.usedCount >= promotion.maxUses) errors.push("Promotion usage limit reached");

  // Check applicable plans
  if (promotion.applicablePlans && planId) {
    const applicablePlans: string[] = JSON.parse(promotion.applicablePlans);
    if (applicablePlans.length > 0 && !applicablePlans.includes(planId)) {
      errors.push("Promotion not applicable to this plan");
    }
  }

  // If invoiceId provided, calculate the actual discount
  let discountAmount = 0;
  let invoice = null;
  if (invoiceId && errors.length === 0) {
    invoice = await db.invoice.findFirst({ where: { id: invoiceId, tenantId: ctx.tenantId } });
    if (!invoice) {
      errors.push("Invoice not found");
    } else {
      const subtotal = invoice.subtotal.toNumber();
      if (promotion.type === "percentage") {
        discountAmount = Math.round((subtotal * promotion.value) / 100 * 100) / 100;
      } else if (promotion.type === "flat") {
        discountAmount = Math.min(promotion.value, subtotal);
      } else if (promotion.type === "free_trial") {
        discountAmount = subtotal;
      }
    }
  }

  if (errors.length > 0) {
    return ok({
      valid: false, errors,
      promotion: { name: promotion.name, code: promotion.code, type: promotion.type, value: promotion.value },
    });
  }

  return ok({
    valid: true,
    promotion: {
      id: promotion.id, name: promotion.name, code: promotion.code,
      type: promotion.type, value: promotion.value, description: promotion.description,
    },
    discountAmount,
    invoice: invoice ? { number: invoice.number, subtotal: invoice.subtotal.toNumber(), total: invoice.total.toNumber() } : null,
  });
});
