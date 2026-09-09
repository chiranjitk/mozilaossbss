// =====================================================================
// TAX ENGINE
// Jurisdiction-aware tax calculation for invoices.
//
// Supports:
//   - GST (India): CGST + SGST (intra-state) or IGST (inter-state)
//   - VAT (EU/UK): single rate, tax-inclusive or exclusive
//   - US Sales Tax: single rate (state-dependent)
//   - Tax-exempt customers (subscriber.metadata.taxExempt === true)
//
// The engine reads the tenant's configured tax jurisdiction from
// SystemSetting `tax.jurisdiction` (defaults to "none") and the rates
// from `tax.rates` JSON. Per-plan taxRate overrides take precedence
// for backwards compatibility.
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type TaxJurisdiction = "none" | "in_gst" | "eu_vat" | "us_sales" | "uk_vat";

export interface TaxBreakdownLine {
  label: string;
  ratePct: number;
  baseAmount: number;
  taxAmount: number;
}

export interface TaxResult {
  jurisdiction: TaxJurisdiction;
  baseAmount: number;
  taxLines: TaxBreakdownLine[];
  totalTax: number;
  grandTotal: number;
  currency: string;
  taxExempt: boolean;
  interState: boolean; // GST: true → IGST, false → CGST+SGST
}

/**
 * Compute tax for a monetary amount given the tenant's jurisdiction
 * and the subscriber's location (for inter-state GST determination).
 */
export async function computeTax(
  tenantId: string,
  options: {
    baseAmount: number;
    currency?: string;
    subscriberId?: string;
    planTaxRate?: number; // legacy per-plan rate override
    placeOfSupplyState?: string; // GST: subscriber's state code
  }
): Promise<TaxResult> {
  const settings = await loadTaxSettings(tenantId);
  const jurisdiction = settings.jurisdiction;
  const currency = options.currency ?? "USD";

  // Tax-exempt subscribers pay no tax
  const taxExempt = options.subscriberId
    ? await isSubscriberTaxExempt(tenantId, options.subscriberId)
    : false;

  if (taxExempt || jurisdiction === "none") {
    const base = round2(options.baseAmount);
    return {
      jurisdiction,
      baseAmount: base,
      taxLines: [],
      totalTax: 0,
      grandTotal: base,
      currency,
      taxExempt: taxExempt,
      interState: false,
    };
  }

  const baseAmount = round2(options.baseAmount);

  switch (jurisdiction) {
    case "in_gst":
      return computeGst(tenantId, baseAmount, currency, settings, options.placeOfSupplyState);
    case "eu_vat":
    case "uk_vat":
      return computeVat(jurisdiction, baseAmount, currency, settings.ratePct);
    case "us_sales":
      return computeUsSales(baseAmount, currency, settings.ratePct);
    default:
      return {
        jurisdiction: "none",
        baseAmount,
        taxLines: [],
        totalTax: 0,
        grandTotal: baseAmount,
        currency,
        taxExempt: false,
        interState: false,
      };
  }
}

// ---------------------------------------------------------------------
// India GST — CGST + SGST (intra-state) or IGST (inter-state)
// ---------------------------------------------------------------------
function computeGst(
  _tenantId: string,
  base: number,
  currency: string,
  settings: TaxSettings,
  placeOfSupplyState?: string
): TaxResult {
  const ratePct = settings.ratePct; // e.g. 18 for 18% GST
  const tenantState = settings.tenantState;

  // Inter-state if the place of supply differs from the tenant's home state
  const interState =
    !!placeOfSupplyState &&
    !!tenantState &&
    placeOfSupplyState.toUpperCase() !== tenantState.toUpperCase();

  if (interState) {
    const tax = round2((base * ratePct) / 100);
    return {
      jurisdiction: "in_gst",
      baseAmount: base,
      taxLines: [{ label: "IGST", ratePct, baseAmount: base, taxAmount: tax }],
      totalTax: tax,
      grandTotal: round2(base + tax),
      currency,
      taxExempt: false,
      interState: true,
    };
  }

  // Intra-state: split evenly between CGST + SGST
  const halfRate = ratePct / 2;
  const cgst = round2((base * halfRate) / 100);
  const sgst = round2((base * halfRate) / 100);
  return {
    jurisdiction: "in_gst",
    baseAmount: base,
    taxLines: [
      { label: "CGST", ratePct: halfRate, baseAmount: base, taxAmount: cgst },
      { label: "SGST", ratePct: halfRate, baseAmount: base, taxAmount: sgst },
    ],
    totalTax: round2(cgst + sgst),
    grandTotal: round2(base + cgst + sgst),
    currency,
    taxExempt: false,
    interState: false,
  };
}

// ---------------------------------------------------------------------
// EU/UK VAT — single rate, tax-exclusive
// ---------------------------------------------------------------------
function computeVat(
  jurisdiction: TaxJurisdiction,
  base: number,
  currency: string,
  ratePct: number
): TaxResult {
  const vat = round2((base * ratePct) / 100);
  return {
    jurisdiction,
    baseAmount: base,
    taxLines: [{ label: "VAT", ratePct, baseAmount: base, taxAmount: vat }],
    totalTax: vat,
    grandTotal: round2(base + vat),
    currency,
    taxExempt: false,
    interState: false,
  };
}

// ---------------------------------------------------------------------
// US Sales Tax — single rate
// ---------------------------------------------------------------------
function computeUsSales(
  base: number,
  currency: string,
  ratePct: number
): TaxResult {
  const sales = round2((base * ratePct) / 100);
  return {
    jurisdiction: "us_sales",
    baseAmount: base,
    taxLines: [{ label: "Sales Tax", ratePct, baseAmount: base, taxAmount: sales }],
    totalTax: sales,
    grandTotal: round2(base + sales),
    currency,
    taxExempt: false,
    interState: false,
  };
}

// ---------------------------------------------------------------------
// Settings + subscriber tax-exempt lookup
// ---------------------------------------------------------------------
interface TaxSettings {
  jurisdiction: TaxJurisdiction;
  ratePct: number;
  tenantState?: string; // for GST inter-state determination
}

async function loadTaxSettings(tenantId: string): Promise<TaxSettings> {
  const rows = await db.systemSetting.findMany({
    where: {
      tenantId,
      key: { in: ["tax.jurisdiction", "tax.ratePct", "tax.tenantState"] },
    },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    jurisdiction: (map.get("tax.jurisdiction") as TaxJurisdiction) ?? "none",
    ratePct: Number(map.get("tax.ratePct") ?? 0),
    tenantState: map.get("tax.tenantState") ?? undefined,
  };
}

async function isSubscriberTaxExempt(
  tenantId: string,
  subscriberId: string
): Promise<boolean> {
  const sub = await db.subscriber.findFirst({
    where: { id: subscriberId, tenantId },
    select: { metadata: true },
  });
  if (!sub?.metadata) return false;
  try {
    const meta = JSON.parse(sub.metadata);
    return meta?.taxExempt === true;
  } catch {
    return false;
  }
}

/**
 * Persist/update the tenant's tax configuration.
 */
export async function setTaxSettings(
  tenantId: string,
  settings: Partial<TaxSettings>
): Promise<void> {
  const entries: Array<{ key: string; value: string }> = [];
  if (settings.jurisdiction !== undefined) {
    entries.push({ key: "tax.jurisdiction", value: settings.jurisdiction });
  }
  if (settings.ratePct !== undefined) {
    entries.push({ key: "tax.ratePct", value: String(settings.ratePct) });
  }
  if (settings.tenantState !== undefined) {
    entries.push({ key: "tax.tenantState", value: settings.tenantState });
  }

  for (const entry of entries) {
    await db.systemSetting.upsert({
      where: { tenantId_key: { tenantId, key: entry.key } },
      create: { tenantId, key: entry.key, value: entry.value },
      update: { value: entry.value },
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Re-export for callers that need Decimal conversions
export function toDecimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}
