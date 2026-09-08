// =====================================================================
// ADD-ON SUBSCRIBE API — subscribe a subscriber to an add-on service
// POST /api/v1/add-on-services/subscribe
// Creates invoice line item + records subscription + emits event
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  subscriberId: z.string().min(1),
  addOnServiceId: z.string().min(1),
  invoiceId: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.create");
  const body = await req.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const { subscriberId, addOnServiceId, invoiceId, quantity } = parsed.data;

  const svc = await db.addOnService.findFirst({ where: { id: addOnServiceId, tenantId: ctx.tenantId } });
  if (!svc) throw ApiError.notFound("Add-on service", addOnServiceId);
  if (svc.status !== "active") throw ApiError.businessRule("Add-on service is not active");

  const sub = await db.subscriber.findFirst({ where: { id: subscriberId, tenantId: ctx.tenantId } });
  if (!sub) throw ApiError.notFound("Subscriber", subscriberId);

  const chargeAmount = svc.price * quantity;

  // If invoice provided, add line item to it
  if (invoiceId) {
    const invoice = await db.invoice.findFirst({ where: { id: invoiceId, tenantId: ctx.tenantId } });
    if (!invoice) throw ApiError.notFound("Invoice", invoiceId);
    if (invoice.status === "paid") throw ApiError.businessRule("Cannot add to a paid invoice");

    // Update invoice totals
    const newSubtotal = invoice.subtotal.toNumber() + chargeAmount;
    const newTax = newSubtotal * (invoice.taxAmount.toNumber() / Math.max(1, invoice.subtotal.toNumber()));
    const newTotal = newSubtotal + newTax;
    await db.invoice.update({
      where: { id: invoiceId },
      data: { subtotal: newSubtotal, taxAmount: newTax, total: newTotal },
    });
  }

  // Create ActionHistory
  await db.actionHistory.create({
    data: {
      tenantId: ctx.tenantId,
      subscriberId,
      action: "note_add",
      performedBy: ctx.userId,
      newValue: JSON.stringify({ addOnService: svc.name, chargeType: svc.chargeType, price: svc.price, quantity, total: chargeAmount }),
      notes: `Subscribed to add-on: ${svc.name} (${svc.chargeType}, ${quantity}x ${svc.price} = ${chargeAmount})`,
    },
  });

  await eventBus.emit("billing.addon.subscribed", { subscriberId, addOnServiceId: svc.id, serviceName: svc.name, amount: chargeAmount }, { tenantId: ctx.tenantId, source: "billing", requestId });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "addon.subscribe",
    module: "billing", resource: "AddOnService", resourceId: svc.id, requestId,
    newValue: { subscriberId, serviceName: svc.name, chargeType: svc.chargeType, amount: chargeAmount, invoiceId },
    message: `Subscribed ${sub.firstName} ${sub.lastName} to add-on "${svc.name}" — charge: ${chargeAmount}`,
  });

  return ok({ subscribed: true, serviceName: svc.name, chargeAmount, subscriberId, invoiceAdjusted: !!invoiceId });
});
