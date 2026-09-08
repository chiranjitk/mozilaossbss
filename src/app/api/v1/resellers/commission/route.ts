// =====================================================================
// RESELLER COMMISSION API — calculate commission on payments
// POST /api/v1/resellers/commission — calculate commission for a payment
// GET /api/v1/resellers/[id]/commission — list commission history
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// POST /api/v1/resellers/commission — calculate and record commission
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.reseller.write");
  const body = await req.json();
  const { resellerId, paymentId, amount } = body as { resellerId: string; paymentId: string; amount: number };

  if (!resellerId || !paymentId || !amount) {
    throw ApiError.businessRule("resellerId, paymentId, and amount are required");
  }

  const reseller = await db.reseller.findFirst({ where: { id: resellerId, tenantId: ctx.tenantId } });
  if (!reseller) throw ApiError.notFound("Reseller", resellerId);
  if (reseller.status !== "active") throw ApiError.businessRule("Reseller is not active");

  // === INDUSTRY STANDARD: Real commission calculation ===
  let commissionAmount = 0;

  if (reseller.commissionMethod === "percentage") {
    // Percentage of payment amount
    commissionAmount = (amount * reseller.commissionRate) / 100;
  } else if (reseller.commissionMethod === "flat") {
    // Fixed amount per payment
    commissionAmount = reseller.commissionRate;
  } else if (reseller.commissionMethod === "slab") {
    // Slab-based: higher amounts = higher commission
    if (amount >= 5000) commissionAmount = (amount * 15) / 100;
    else if (amount >= 2000) commissionAmount = (amount * 12) / 100;
    else if (amount >= 500) commissionAmount = (amount * 10) / 100;
    else commissionAmount = (amount * 8) / 100;
  }

  // Add commission to reseller balance
  const newBalance = reseller.balance + commissionAmount;
  await db.reseller.update({
    where: { id: resellerId },
    data: { balance: newBalance },
  });

  // Create ActionHistory for commission
  await db.actionHistory.create({
    data: {
      tenantId: ctx.tenantId,
      action: "note_add",
      performedBy: ctx.userId,
      newValue: JSON.stringify({
        type: "commission",
        resellerId,
        resellerName: reseller.name,
        paymentId,
        paymentAmount: amount,
        commissionMethod: reseller.commissionMethod,
        commissionRate: reseller.commissionRate,
        commissionAmount,
        newBalance,
      }),
      notes: `Commission: ${reseller.name} earned ${commissionAmount} from payment ${paymentId} (method: ${reseller.commissionMethod}, rate: ${reseller.commissionRate})`,
    },
  });

  await eventBus.emit("reseller.commission.earned", { resellerId, commissionAmount, paymentId, newBalance }, { tenantId: ctx.tenantId, source: "operations", requestId });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "reseller.commission",
    module: "operations", resource: "Reseller", resourceId: resellerId, requestId,
    newValue: { commissionAmount, paymentAmount: amount, method: reseller.commissionMethod, rate: reseller.commissionRate, newBalance },
    message: `Commission calculated: ${reseller.name} earned ${commissionAmount} (${reseller.commissionMethod} @ ${reseller.commissionRate}) → new balance: ${newBalance}`,
  });

  return ok({
    resellerId,
    resellerName: reseller.name,
    paymentAmount: amount,
    commissionMethod: reseller.commissionMethod,
    commissionRate: reseller.commissionRate,
    commissionAmount,
    newBalance,
  });
});
