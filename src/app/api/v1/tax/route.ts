// =====================================================================
// TAX API — tax/GST summary with monthly breakdown
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("finance", "finance.tax.read");
  const url = new URL(req.url);
  const range = url.searchParams.get("range") ?? "12m";

  const now = new Date();
  let startDate: Date;
  switch (range) {
    case "3m": startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); break;
    case "6m": startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1); break;
    case "ytd": startDate = new Date(now.getFullYear(), 0, 1); break;
    default: startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1); break;
  }

  // Fetch invoices with tax info
  const invoices = await db.invoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      issueDate: { gte: startDate },
      status: { not: "cancelled" },
    },
    select: { subtotal: true, taxAmount: true, total: true, amountPaid: true, issueDate: true, status: true },
  });

  // Monthly tax breakdown
  const monthlyTax = new Map<string, { subtotal: number; taxAmount: number; total: number }>();
  for (const inv of invoices) {
    const monthKey = `${inv.issueDate.getFullYear()}-${String(inv.issueDate.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyTax.get(monthKey) ?? { subtotal: 0, taxAmount: 0, total: 0 };
    existing.subtotal += inv.subtotal.toNumber();
    existing.taxAmount += inv.taxAmount.toNumber();
    existing.total += inv.total.toNumber();
    monthlyTax.set(monthKey, existing);
  }

  // Fill missing months
  const months: Array<{ month: string; subtotal: number; taxAmount: number; total: number; taxRate: number }> = [];
  const iter = new Date(startDate);
  while (iter <= now) {
    const key = `${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, "0")}`;
    const data = monthlyTax.get(key) ?? { subtotal: 0, taxAmount: 0, total: 0 };
    const taxRate = data.subtotal > 0 ? (data.taxAmount / data.subtotal) * 100 : 0;
    months.push({
      month: iter.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      subtotal: data.subtotal,
      taxAmount: data.taxAmount,
      total: data.total,
      taxRate,
    });
    iter.setMonth(iter.getMonth() + 1);
  }

  // Summary
  const totalSubtotal = invoices.reduce((s, i) => s + i.subtotal.toNumber(), 0);
  const totalTax = invoices.reduce((s, i) => s + i.taxAmount.toNumber(), 0);
  const totalRevenue = invoices.reduce((s, i) => s + i.total.toNumber(), 0);
  const avgTaxRate = totalSubtotal > 0 ? (totalTax / totalSubtotal) * 100 : 0;

  return ok({
    summary: {
      totalSubtotal,
      totalTax,
      totalRevenue,
      avgTaxRate,
      invoiceCount: invoices.length,
    },
    monthlyData: months,
  });
});
