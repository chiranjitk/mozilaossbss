// =====================================================================
// BILLING PREVIEW API — rate a subscriber's next invoice without creating it
// GET /api/v1/billing/preview?subscriberId=xxx
// Shows cycle bounds, proration, add-ons, overage, overrides, tax, total.
// Pure read-only: uses the same rating engine as runBilling.
// =====================================================================

import { NextRequest } from "next/server";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { db } from "@/lib/db";
import { parseCycle, getCycleBounds, prorationFactor, nextBillingDate } from "@/core/billing/cycle";
import { rateSubscription, rateAddOn, rateOverage, rateInvoice, toMajor } from "@/core/billing/rating";
import { aggregateUsageMb } from "@/core/repositories/billing/invoice";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const subscriberId = req.nextUrl.searchParams.get("subscriberId");
  if (!subscriberId) throw ApiError.validation("subscriberId is required");

  const sub = await db.subscriber.findFirst({
    where: { id: subscriberId, tenantId: ctx.tenantId },
    include: { plan: true },
  });
  if (!sub) throw ApiError.notFound("Subscriber", subscriberId);
  if (!sub.plan) throw ApiError.businessRule("Subscriber has no plan assigned");

  const plan = sub.plan;
  const cycle = parseCycle(plan.billingCycle);
  const anchor = sub.billingAnchorDate ?? sub.createdAt;
  const now = new Date();
  const bounds = getCycleBounds(cycle, anchor, now);

  const isFirstCycle = sub.lastBilledAt == null;
  const proration =
    isFirstCycle && sub.createdAt > bounds.periodStart
      ? prorationFactor(cycle, anchor, sub.createdAt, now)
      : 1;

  const subscriptionLines = rateSubscription(plan, cycle, proration);

  // Recurring add-ons from subscriber metadata
  let metaAddOns: Array<Record<string, unknown>> = [];
  try {
    const meta = sub.metadata ? (JSON.parse(sub.metadata) as Record<string, unknown>) : null;
    if (meta && Array.isArray(meta.addOns)) metaAddOns = meta.addOns as Array<Record<string, unknown>>;
  } catch {
    /* ignore malformed metadata */
  }
  const addOnLines = metaAddOns
    .filter((a) => a && typeof a === "object" && a.name)
    .map((a) =>
      rateAddOn(
        {
          id: String(a.id ?? ""),
          name: String(a.name),
          chargeType: String(a.chargeType ?? "flat"),
          price: Number(a.price ?? 0),
          quantity: Number(a.quantity ?? 1),
        },
        { daysInCycle: bounds.totalDays }
      )
    )
    .filter((l) => Math.round(l.amount * 100) > 0);

  // Usage + overage
  let usage: { downMb: number; upMb: number; totalMb: number } | null = null;
  let overageBilled = false;
  let overageGb = 0;
  let overageCents = 0;
  if (plan.dataCap != null && plan.dataCap > 0) {
    usage = await aggregateUsageMb(sub.id, bounds.periodStart, bounds.periodEnd);
    const setting = await db.systemSetting.findFirst({
      where: { tenantId: ctx.tenantId, key: "billing.overagePerGb" },
    });
    const perGbMajor = setting ? parseFloat(setting.value) : 0;
    const perGbCents =
      Number.isFinite(perGbMajor) && perGbMajor > 0 ? Math.round(perGbMajor * 100) : 0;
    const o = rateOverage(plan.dataCap, usage.totalMb, perGbCents);
    overageBilled = o.billed;
    overageGb = o.chargeableGb;
    overageCents = o.cents;
  }

  const overrides = await db.chargeOverride.findMany({
    where: {
      tenantId: ctx.tenantId,
      subscriberId: sub.id,
      status: "active",
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gt: now } }],
    },
  });

  const rated = rateInvoice({
    subscriptionLines,
    addOnLines,
    overageLine:
      overageBilled && plan.dataCap != null && usage
        ? {
            description: `Data overage — ${overageGb} GB above ${plan.dataCap} MB cap (${Math.round(usage.totalMb)} MB used)`,
            quantity: overageGb,
            unitPrice: toMajor(Math.round(overageCents / Math.max(1, overageGb))),
            amount: toMajor(overageCents),
            kind: "overage",
          }
        : null,
    overrides: overrides.map((o) => ({
      id: o.id,
      type: o.type,
      valueType: o.valueType,
      value: o.value,
      description: o.description ?? undefined,
    })),
    taxRatePercent: plan.taxRate.toNumber(),
  });

  return ok({
    subscriber: {
      id: sub.id,
      customerId: sub.customerId,
      name: `${sub.firstName} ${sub.lastName}`,
      status: sub.status,
      lastBilledAt: sub.lastBilledAt,
    },
    plan: {
      id: plan.id,
      name: plan.name,
      code: plan.code,
      price: plan.price.toNumber(),
      currency: plan.currency,
      billingCycle: cycle,
      dataCapMb: plan.dataCap,
      taxRatePercent: plan.taxRate.toNumber(),
    },
    cycle: {
      periodStart: bounds.periodStart.toISOString(),
      periodEnd: bounds.periodEnd.toISOString(),
      totalDays: bounds.totalDays,
      nextBillingDate: nextBillingDate(cycle, anchor, now).toISOString(),
    },
    proration: { applied: proration < 1, factor: proration },
    usage: usage
      ? {
          ...usage,
          capMb: plan.dataCap,
          overageBilled,
          overageGb,
        }
      : null,
    lines: rated.lines,
    totals: {
      subtotal: toMajor(rated.subtotalCents),
      tax: toMajor(rated.taxCents),
      total: toMajor(rated.totalCents),
      currency: plan.currency,
    },
  });
});
