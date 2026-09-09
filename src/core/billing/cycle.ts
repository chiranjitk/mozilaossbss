// =====================================================================
// BILLING CYCLE ENGINE — period math for monthly/quarterly/yearly/one_time
// Pure functions: no DB access, fully unit-testable.
// All cycle boundaries are computed in the tenant's timezone-agnostic UTC day
// granularity; anchor semantics: billing renews on the anchor day-of-month.
// =====================================================================



export type BillingCycleType = "monthly" | "quarterly" | "yearly" | "one_time";

export const BILLING_CYCLES: BillingCycleType[] = [
  "monthly",
  "quarterly",
  "yearly",
  "one_time",
];

export function parseCycle(value: string | null | undefined): BillingCycleType {
  if (value && (BILLING_CYCLES as string[]).includes(value)) {
    return value as BillingCycleType;
  }
  return "monthly";
}

export interface CycleBounds {
  periodStart: Date;
  periodEnd: Date; // exclusive
  /** Total days in the cycle (inclusive of start day, exclusive of end day) */
  totalDays: number;
}

function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // Handle anchor-day overflow (e.g. Jan 31 + 1 month → Feb 28/29)
  if (d.getDate() !== date.getDate()) {
    d.setDate(0); // clamp to last day of previous month
  }
  return d;
}

/**
 * Compute the cycle bounds covering `now` for a subscriber anchored at `anchor`.
 * For monthly: period runs anchor→anchor each month.
 * Example: anchor = Jan 15 → cycle covering Feb 10 is [Jan 15, Feb 15).
 */
export function getCycleBounds(
  cycle: BillingCycleType,
  anchor: Date,
  now: Date = new Date()
): CycleBounds {
  if (cycle === "one_time") {
    // One-time charges have no recurring period; treat as a single day window.
    const start = startOfDay(anchor);
    return {
      periodStart: start,
      periodEnd: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      totalDays: 1,
    };
  }

  const monthsPerCycle = cycle === "monthly" ? 1 : cycle === "quarterly" ? 3 : 12;

  // Walk backwards/forwards from anchor to find the cycle window containing `now`.
  // Guard against infinite loops with a hard cap (50 years of cycles).
  let periodStart = new Date(anchor.getTime());
  let guard = 0;
  if (now.getTime() >= periodStart.getTime()) {
    while (addMonths(periodStart, monthsPerCycle).getTime() <= now.getTime() && guard < 600) {
      periodStart = addMonths(periodStart, monthsPerCycle);
      guard++;
    }
  } else {
    while (periodStart.getTime() > now.getTime() && guard < 600) {
      periodStart = addMonths(periodStart, -monthsPerCycle);
      guard++;
    }
  }

  const periodEnd = addMonths(periodStart, monthsPerCycle);
  return {
    periodStart: startOfDay(periodStart),
    periodEnd: startOfDay(periodEnd),
    totalDays: Math.max(1, daysBetween(periodStart, periodEnd)),
  };
}

export function startOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Proration factor for a subscriber whose service started/changed mid-cycle.
 * factor = remainingDaysInCycle / totalDaysInCycle, clamped to (0, 1].
 */
export function prorationFactor(
  cycle: BillingCycleType,
  anchor: Date,
  serviceStartDate: Date,
  now: Date = new Date()
): number {
  const { periodStart, periodEnd, totalDays } = getCycleBounds(cycle, anchor, now);
  const effectiveStart = serviceStartDate > periodStart ? serviceStartDate : periodStart;
  const remainingDays = daysBetween(effectiveStart, periodEnd);
  if (remainingDays <= 0) return 0;
  const factor = remainingDays / totalDays;
  return Math.min(1, Math.max(0, Math.round(factor * 10000) / 10000)); // 4dp
}

/**
 * Next billing date: start of the cycle window after the one containing `now`.
 */
export function nextBillingDate(
  cycle: BillingCycleType,
  anchor: Date,
  now: Date = new Date()
): Date {
  const { periodEnd } = getCycleBounds(cycle, anchor, now);
  return periodEnd;
}

/**
 * Days until the next billing date (fractional, min 0).
 */
export function daysUntilNextBilling(
  cycle: BillingCycleType,
  anchor: Date,
  now: Date = new Date()
): number {
  const next = nextBillingDate(cycle, anchor, now);
  return Math.max(0, daysBetween(now, next));
}
