// =====================================================================
// BILLING ENGINE TESTS — cycle math, rating, proration, overrides, tax
// Run: bun test tests/billing-engine.test.ts
// =====================================================================

import { describe, test, expect } from "bun:test";
import {
  parseCycle,
  getCycleBounds,
  prorationFactor,
  nextBillingDate,
} from "../src/core/billing/cycle";
import {
  toCents,
  toMajor,
  rateSubscription,
  rateAddOn,
  rateOverage,
  applyOverrideCents,
  applyOverrides,
  computeTaxCents,
  rateInvoice,
} from "../src/core/billing/rating";

// ---------------------------------------------------------------------
// Cycle parsing
// ---------------------------------------------------------------------
describe("parseCycle", () => {
  test("parses valid cycles", () => {
    expect(parseCycle("monthly")).toBe("monthly");
    expect(parseCycle("quarterly")).toBe("quarterly");
    expect(parseCycle("yearly")).toBe("yearly");
    expect(parseCycle("one_time")).toBe("one_time");
  });
  test("falls back to monthly for invalid/empty", () => {
    expect(parseCycle("weekly")).toBe("monthly");
    expect(parseCycle("")).toBe("monthly");
    expect(parseCycle(undefined)).toBe("monthly");
  });
});

// ---------------------------------------------------------------------
// Cycle bounds — anchor semantics
// ---------------------------------------------------------------------
describe("getCycleBounds", () => {
  test("monthly: anchor Jan 15, now Jan 20 → [Jan 15, Feb 15)", () => {
    const bounds = getCycleBounds(
      "monthly",
      new Date(2026, 0, 15),
      new Date(2026, 0, 20)
    );
    expect(bounds.periodStart.getMonth()).toBe(0);
    expect(bounds.periodStart.getDate()).toBe(15);
    expect(bounds.periodEnd.getMonth()).toBe(1);
    expect(bounds.periodEnd.getDate()).toBe(15);
    expect(bounds.totalDays).toBe(31);
  });

  test("monthly: anchor Jan 31 clamps to Feb 28 in non-leap years", () => {
    const bounds = getCycleBounds(
      "monthly",
      new Date(2026, 0, 31),
      new Date(2026, 1, 10) // Feb 10
    );
    // Cycle start should clamp to Jan 31, end to Feb 28
    expect(bounds.periodStart.getDate()).toBe(31);
    expect(bounds.periodEnd.getMonth()).toBe(1);
    expect(bounds.periodEnd.getDate()).toBe(28);
  });

  test("quarterly covers 3 months", () => {
    const bounds = getCycleBounds(
      "quarterly",
      new Date(2026, 0, 1),
      new Date(2026, 1, 15)
    );
    expect(bounds.periodEnd.getMonth()).toBe(3); // April
    expect(bounds.totalDays).toBeGreaterThanOrEqual(89);
  });

  test("yearly covers 12 months", () => {
    const bounds = getCycleBounds(
      "yearly",
      new Date(2026, 2, 10),
      new Date(2026, 5, 1)
    );
    expect(bounds.periodEnd.getFullYear()).toBe(2027);
    expect(bounds.periodEnd.getMonth()).toBe(2);
  });

  test("one_time is a single-day window", () => {
    const bounds = getCycleBounds(
      "one_time",
      new Date(2026, 5, 15),
      new Date(2026, 5, 20)
    );
    expect(bounds.totalDays).toBe(1);
  });

  test("period before anchor walks backwards", () => {
    const bounds = getCycleBounds(
      "monthly",
      new Date(2026, 5, 15), // anchor June 15
      new Date(2026, 4, 1) // now May 1 → cycle [Apr 15, May 15)
    );
    expect(bounds.periodStart.getMonth()).toBe(3);
    expect(bounds.periodStart.getDate()).toBe(15);
  });
});

// ---------------------------------------------------------------------
// Proration
// ---------------------------------------------------------------------
describe("prorationFactor", () => {
  test("service at cycle start → factor 1", () => {
    const f = prorationFactor(
      "monthly",
      new Date(2026, 0, 1),
      new Date(2026, 0, 1),
      new Date(2026, 0, 10)
    );
    expect(f).toBe(1);
  });

  test("service mid-cycle → proportional factor", () => {
    // 31-day January anchored on the 1st; service starts Jan 16 → 16 days remain of 31
    const f = prorationFactor(
      "monthly",
      new Date(2026, 0, 1),
      new Date(2026, 0, 16),
      new Date(2026, 0, 20)
    );
    expect(f).toBeCloseTo(16 / 31, 3);
  });

  test("service after cycle end → factor 0", () => {
    const f = prorationFactor(
      "monthly",
      new Date(2026, 0, 1),
      new Date(2026, 1, 20),
      new Date(2026, 0, 20)
    );
    expect(f).toBe(0);
  });

  test("factor never exceeds 1", () => {
    const f = prorationFactor(
      "monthly",
      new Date(2026, 0, 1),
      new Date(2025, 10, 1), // started before the anchor
      new Date(2026, 0, 20)
    );
    expect(f).toBe(1);
  });
});

describe("nextBillingDate", () => {
  test("is the cycle end", () => {
    const next = nextBillingDate("monthly", new Date(2026, 0, 15), new Date(2026, 0, 20));
    expect(next.getDate()).toBe(15);
    expect(next.getMonth()).toBe(1);
  });
});

// ---------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------
describe("money helpers", () => {
  test("toCents rounds half-up", () => {
    expect(toCents(10.005)).toBe(1001); // float artifacts → round
    expect(toCents(499)).toBe(49900);
    expect(toCents("799.99")).toBe(79999);
  });
  test("toMajor round-trips", () => {
    expect(toMajor(49900)).toBe(499);
    expect(toMajor(79999)).toBe(799.99);
  });
});

// ---------------------------------------------------------------------
// Subscription rating
// ---------------------------------------------------------------------
describe("rateSubscription", () => {
  test("monthly plan prices full cycle", () => {
    const lines = rateSubscription({ name: "Basic", price: 499, billingCycle: "monthly" }, "monthly");
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(499);
    expect(lines[0].kind).toBe("subscription");
  });

  test("quarterly = 3× monthly", () => {
    const lines = rateSubscription({ name: "Basic", price: 499, billingCycle: "monthly" }, "quarterly");
    expect(lines[0].amount).toBe(1497);
  });

  test("yearly = 12× monthly", () => {
    const lines = rateSubscription({ name: "Basic", price: 499, billingCycle: "monthly" }, "yearly");
    expect(lines[0].amount).toBe(5988);
  });

  test("proration scales the line and marks it", () => {
    const lines = rateSubscription(
      { name: "Basic", price: 620, billingCycle: "monthly" },
      "monthly",
      0.5
    );
    expect(lines[0].amount).toBe(310);
    expect(lines[0].kind).toBe("prorated_subscription");
    expect(lines[0].description).toContain("prorated 50%");
  });

  test("one_time ignores multipliers", () => {
    const lines = rateSubscription({ name: "Install", price: 1500, billingCycle: "one_time" }, "one_time");
    expect(lines[0].amount).toBe(1500);
  });
});

// ---------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------
describe("rateAddOn", () => {
  test("flat price × quantity", () => {
    const line = rateAddOn({ id: "a", name: "Static IP", chargeType: "flat", price: 100 }, { daysInCycle: 30 });
    expect(line.amount).toBe(100);
  });
  test("per_day multiplies by cycle days", () => {
    const line = rateAddOn({ id: "b", name: "Daily boost", chargeType: "per_day", price: 5 }, { daysInCycle: 31 });
    expect(line.amount).toBe(155);
  });
  test("per_month ignores days", () => {
    const line = rateAddOn({ id: "c", name: "Premium DNS", chargeType: "per_month", price: 49 }, { daysInCycle: 28 });
    expect(line.amount).toBe(49);
  });
  test("per_gb uses overage GB", () => {
    const line = rateAddOn({ id: "d", name: "Extra data", chargeType: "per_gb", price: 50 }, { daysInCycle: 30, overageGb: 4 });
    expect(line.amount).toBe(200);
  });
  test("per_gb with zero overage is zero", () => {
    const line = rateAddOn({ id: "e", name: "Extra data", chargeType: "per_gb", price: 50 }, { daysInCycle: 30, overageGb: 0 });
    expect(line.amount).toBe(0);
  });
});

// ---------------------------------------------------------------------
// Data-cap overage
// ---------------------------------------------------------------------
describe("rateOverage", () => {
  test("no cap → never billed", () => {
    expect(rateOverage(null, 999999, 500).billed).toBe(false);
  });
  test("usage below cap → not billed", () => {
    expect(rateOverage(1024, 1000, 500).billed).toBe(false);
  });
  test("partial GB above cap floors to whole GB", () => {
    // cap 1024MB (1GB), used 2048MB (2GB) → 1GB over → 1 × 500c
    const r = rateOverage(1024, 2048, 500);
    expect(r.billed).toBe(true);
    expect(r.chargeableGb).toBe(1);
    expect(r.cents).toBe(500);
  });
  test("multi-GB overage", () => {
    const r = rateOverage(1024, 6 * 1024 + 300, 500); // ~5.29 GB over → 5 GB
    expect(r.chargeableGb).toBe(5);
    expect(r.cents).toBe(2500);
  });
  test("zero price disables billing", () => {
    expect(rateOverage(1024, 99999, 0).billed).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------
describe("applyOverrideCents", () => {
  test("percentage discount", () => {
    const { deltaCents, resultCents } = applyOverrideCents(10000, {
      id: "x", type: "discount", valueType: "percentage", value: 10,
    });
    expect(deltaCents).toBe(-1000);
    expect(resultCents).toBe(9000);
  });
  test("percentage surcharge", () => {
    const { resultCents } = applyOverrideCents(10000, {
      id: "x", type: "surcharge", valueType: "percentage", value: 18,
    });
    expect(resultCents).toBe(11800);
  });
  test("percentage caps at 100%", () => {
    const { resultCents } = applyOverrideCents(10000, {
      id: "x", type: "discount", valueType: "percentage", value: 150,
    });
    expect(resultCents).toBe(0);
  });
  test("flat discount clamps at zero", () => {
    const { resultCents } = applyOverrideCents(500, {
      id: "x", type: "discount", valueType: "flat", value: 99,
    });
    expect(resultCents).toBe(0);
  });
  test("flat surcharge adds", () => {
    const { resultCents } = applyOverrideCents(500, {
      id: "x", type: "surcharge", valueType: "flat", value: 20,
    });
    expect(resultCents).toBe(2500);
  });
});

describe("applyOverrides (sequential)", () => {
  test("applies in order and emits lines", () => {
    const { resultCents, lines } = applyOverrides(10000, [
      { id: "1", type: "discount", valueType: "percentage", value: 10 },
      { id: "2", type: "discount", valueType: "flat", value: 10 },
    ]);
    // 10000 −10% = 9000 → −1000 flat = 8000
    expect(resultCents).toBe(8000);
    expect(lines).toHaveLength(2);
    expect(lines[0].kind).toBe("discount");
  });
});

// ---------------------------------------------------------------------
// Tax + pipeline
// ---------------------------------------------------------------------
describe("computeTaxCents", () => {
  test("18 passed as percent → 18%", () => {
    expect(computeTaxCents(49900, 18)).toBe(8982);
  });
  test("0.18 passed as fraction (DB convention) → 18%", () => {
    expect(computeTaxCents(49900, 0.18)).toBe(8982);
  });
  test("zero rate", () => {
    expect(computeTaxCents(49900, 0)).toBe(0);
  });
  test("absurd rate (>100%) → no tax", () => {
    expect(computeTaxCents(49900, 180)).toBe(0);
  });
});

describe("rateInvoice (full pipeline)", () => {
  test("subscription + overage − discount + tax", () => {
    const rated = rateInvoice({
      subscriptionLines: rateSubscription({ name: "Pro", price: 799, billingCycle: "monthly" }, "monthly"),
      overageLine: {
        description: "Data overage — 2 GB",
        quantity: 2,
        unitPrice: 50,
        amount: 100,
        kind: "overage",
      },
      overrides: [{ id: "d1", type: "discount", valueType: "percentage", value: 10 }],
      taxRate: 18,
    });
    // gross = 79900 + 10000 = 89900 → −10% = 80910 → +18% tax = 80910 + 14564 = 95474
    expect(rated.subtotalCents).toBe(80910);
    expect(rated.taxCents).toBe(14564);
    expect(rated.totalCents).toBe(95474);
    expect(rated.lines).toHaveLength(3); // subscription + overage + discount
  });

  test("negative discount can't produce negative totals", () => {
    const rated = rateInvoice({
      subscriptionLines: [{ description: "x", quantity: 1, unitPrice: 1, amount: 1, kind: "subscription" }],
      overrides: [{ id: "d1", type: "discount", valueType: "flat", value: 100 }],
      taxRate: 18,
    });
    expect(rated.subtotalCents).toBe(0);
    expect(rated.totalCents).toBe(0);
  });
});
