// =====================================================================
// Shared formatting utilities
// =====================================================================
// Currency formatting: defaults to INR (the Cryptsk demo tenant currency).
// Pass an explicit currency code (e.g. "USD", "EUR", "GBP") for rows that
// carry their own currency field; otherwise the tenant default is used.
// =====================================================================

export const TENANT_CURRENCY = "INR";

const CURRENCY_LOCALE: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AED: "en-AE",
  AUD: "en-AU",
  CAD: "en-CA",
  SGD: "en-SG",
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  const key = `${currency}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    const locale = CURRENCY_LOCALE[currency] ?? "en-US";
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

export function formatCurrency(n: number | null | undefined, currency: string = TENANT_CURRENCY): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return getFormatter(currency).format(n);
}

// Returns just the symbol (e.g. ₹, $, €) for inline UI usage.
export function currencySymbol(currency: string = TENANT_CURRENCY): string {
  try {
    const parts = getFormatter(currency).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}
