// =====================================================================
// RATING ENGINE — money math for invoice line items.
// RULES:
//   - ALL arithmetic in integer cents. Floats only at the boundary
//     (converting Decimal-stored plan prices to cents, and cents back).
//   - Discounts can never push a line negative; clamped at 0.
//   - Percentage overrides are capped at 100%.
//   - Rounding: half-up at the cent boundary, always.
// Pure functions: no DB access, fully unit-testable.
// =====================================================================


import { Prisma } from "@prisma/client";
import type { BillingCycleType } from "./cycle";

export interface RatedLineItem {
  description: string;
  quantity: number;
  unitPrice: number; // major units (e.g. 499.00)
  amount: number; // major units
  kind: LineItemKind;
  meta?: Record<string, unknown>;
}

export type LineItemKind =
  | "subscription"
  | "prorated_subscription"
  | "addon"
  | "overage"
  | "discount"
  | "surcharge"
  | "manual";

// ---------------------------------------------------------------------
// Cents helpers
// ---------------------------------------------------------------------

export function toCents(major: number | string | Prisma.Decimal): number {
  const n =
    typeof major === "number"
      ? major
      : major instanceof Prisma.Decimal
        ? major.toNumber()
        : parseFloat(major);
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

export function toMajor(cents: number): number {
  return Math.round(cents) / 100;
}

export function centsToDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(toMajor(Math.round(cents)));
}

// ---------------------------------------------------------------------
// Subscription rating
// ---------------------------------------------------------------------

const CYCLE_MULTIPLIER: Record<BillingCycleType, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
  one_time: 1,
};

/**
 * Rate a subscription for one full cycle.
 * Plan price is quoted per-month; quarterly = 3×, yearly = 12×.
 * (Industry-standard "monthly-equivalent × months" quoting.)
 */
export function rateSubscription(
  plan: {
    name: string;
    price: number | string | Prisma.Decimal;
    billingCycle: string;
  },
  cycle: BillingCycleType,
  proration: number = 1
): RatedLineItem[] {
  const monthlyCents = toCents(plan.price);
  const months = CYCLE_MULTIPLIER[cycle] ?? 1;
  const fullCents = monthlyCents * months;

  if (cycle === "one_time") {
    return [
      {
        description: `${plan.name} — one-time charge`,
        quantity: 1,
        unitPrice: toMajor(fullCents),
        amount: toMajor(fullCents),
        kind: "subscription",
      },
    ];
  }

  const isProrated = proration < 1 && proration > 0;
  const cents = Math.round(fullCents * proration);

  return [
    {
      description: isProrated
        ? `${plan.name} — ${cycle} subscription (prorated ${Math.round(proration * 100)}%)`
        : `${plan.name} — ${cycle} subscription`,
      quantity: 1,
      unitPrice: toMajor(cents),
      amount: toMajor(cents),
      kind: isProrated ? "prorated_subscription" : "subscription",
      meta: isProrated ? { proration, months } : { months },
    },
  ];
}

// ---------------------------------------------------------------------
// Add-on rating
// ---------------------------------------------------------------------

export interface AddOnLike {
  id: string;
  name: string;
  chargeType: string; // flat | per_day | per_gb | per_month
  price: number | string | Prisma.Decimal;
  quantity?: number;
}

export function rateAddOn(
  addOn: AddOnLike,
  context: { daysInCycle: number; overageGb?: number }
): RatedLineItem {
  const unitCents = toCents(addOn.price);
  const qty = addOn.quantity && addOn.quantity > 0 ? addOn.quantity : 1;
  let cents = 0;
  switch (addOn.chargeType) {
    case "flat":
      cents = unitCents * qty;
      break;
    case "per_day":
      cents = unitCents * Math.max(1, context.daysInCycle) * qty;
      break;
    case "per_month":
      cents = unitCents * qty;
      break;
    case "per_gb":
      cents = unitCents * Math.max(0, Math.floor(context.overageGb ?? 0)) * qty;
      break;
    default:
      cents = unitCents * qty;
  }
  return {
    description: `${addOn.name} (${addOn.chargeType})`,
    quantity: qty,
    unitPrice: toMajor(unitCents),
    amount: toMajor(cents),
    kind: "addon",
    meta: { addOnId: addOn.id, chargeType: addOn.chargeType },
  };
}

// ---------------------------------------------------------------------
// Data-cap overage rating (FUP / usage-based)
// ---------------------------------------------------------------------

export interface OverageResult {
  billed: boolean;
  chargeableGb: number; // whole GB above the cap (floor)
  usedMb: number;
  capMb: number;
  cents: number;
}

/**
 * Rate usage above the plan data cap.
 * - Cap in MB (plan.dataCap). Usage in MB (from RADIUS accounting octets).
 * - Only whole GB above the cap are billable (no partial-GB billing).
 * - perGbCents is the unit price per GB in cents.
 */
export function rateOverage(
  capMb: number | null | undefined,
  usedMb: number,
  perGbCents: number
): OverageResult {
  if (capMb == null || capMb <= 0 || usedMb <= capMb || perGbCents <= 0) {
    return { billed: false, chargeableGb: 0, usedMb, capMb: capMb ?? 0, cents: 0 };
  }
  const overMb = usedMb - capMb;
  const chargeableGb = Math.floor(overMb / 1024);
  const cents = chargeableGb * perGbCents;
  return { billed: cents > 0, chargeableGb, usedMb, capMb, cents };
}

// ---------------------------------------------------------------------
// Charge overrides (discount / surcharge)
// ---------------------------------------------------------------------

export interface OverrideLike {
  id: string;
  type: string; // discount | surcharge
  valueType: string; // percentage | flat
  value: number | string | Prisma.Decimal;
  description?: string | null;
}

/**
 * Apply a single override to a base amount (cents) and return the delta
 * and the resulting amount. Discounts clamp at zero; percentages cap at 100.
 */
export function applyOverrideCents(
  baseCents: number,
  override: OverrideLike
): { deltaCents: number; resultCents: number } {
  if (override.valueType === "percentage") {
    // value is a plain percentage number: 10 → 10%
    const raw =
      typeof override.value === "number"
        ? override.value
        : override.value instanceof Prisma.Decimal
          ? override.value.toNumber()
          : parseFloat(String(override.value));
    const pct = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 0));
    const delta = Math.round((baseCents * pct) / 100);
    const signed = override.type === "discount" ? -delta : delta;
    return { deltaCents: signed, resultCents: Math.max(0, baseCents + signed) };
  }
  // flat: value is major units → cents
  const v = toCents(override.value);
  const delta = override.type === "discount" ? -Math.min(baseCents, v) : v;
  return { deltaCents: delta, resultCents: Math.max(0, baseCents + delta) };
}

/**
 * Apply overrides sequentially to a base amount (cents).
 * Returns per-override results for line-item transparency.
 */
export function applyOverrides(
  baseCents: number,
  overrides: OverrideLike[]
): { resultCents: number; lines: RatedLineItem[] } {
  let current = baseCents;
  const lines: RatedLineItem[] = [];
  for (const o of overrides) {
    const { deltaCents, resultCents } = applyOverrideCents(current, o);
    if (deltaCents !== 0) {
      lines.push({
        description:
          o.description ||
          `${o.type === "discount" ? "Discount" : "Surcharge"} (${o.valueType})`,
        quantity: 1,
        unitPrice: toMajor(deltaCents),
        amount: toMajor(deltaCents),
        kind: o.type === "discount" ? "discount" : "surcharge",
        meta: { overrideId: o.id },
      });
    }
    current = resultCents;
  }
  return { resultCents: current, lines };
}

// ---------------------------------------------------------------------
// Tax + totals
// ---------------------------------------------------------------------

/** Tax in cents from a taxRate expressed as a percentage (e.g. 18 → 18%). */
export function computeTaxCents(subtotalCents: number, taxRatePercent: number): number {
  const pct = Math.max(0, taxRatePercent);
  return Math.round((subtotalCents * pct) / 100);
}

export interface RatedInvoice {
  lines: RatedLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Full invoice rating pipeline:
 * subscription lines + add-on lines + overage → overrides → tax.
 */
export function rateInvoice(params: {
  subscriptionLines: RatedLineItem[];
  addOnLines?: RatedLineItem[];
  overageLine?: RatedLineItem | null;
  overrides?: OverrideLike[];
  taxRatePercent: number;
}): RatedInvoice {
  const lines: RatedLineItem[] = [
    ...params.subscriptionLines,
    ...(params.addOnLines ?? []),
    ...(params.overageLine ? [params.overageLine] : []),
  ];

  const grossCents = lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
  const { resultCents, lines: overrideLines } = applyOverrides(grossCents, params.overrides ?? []);
  const allLines = [...lines, ...overrideLines];

  const subtotalCents = resultCents;
  const taxCents = computeTaxCents(subtotalCents, params.taxRatePercent);
  const totalCents = subtotalCents + taxCents;

  return { lines: allLines, subtotalCents, taxCents, totalCents };
}
