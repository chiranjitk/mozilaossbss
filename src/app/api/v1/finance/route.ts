// =====================================================================
// FINANCE API — revenue reports, MRR/ARR, monthly breakdown, tax summary
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";

export const dynamic = "force-dynamic";

// GET /api/v1/finance — revenue dashboard with charts + stats
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("finance", "finance.report.read");
  const url = new URL(req.url);
  const range = url.searchParams.get("range") ?? "12m";

  const now = new Date();

  // Calculate date ranges
  let startDate: Date;
  switch (range) {
    case "3m": startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); break;
    case "6m": startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1); break;
    case "ytd": startDate = new Date(now.getFullYear(), 0, 1); break;
    case "all": startDate = new Date(2020, 0, 1); break;
    default: startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1); break;
  }

  // Fetch all completed payments in range
  const payments = await db.payment.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "completed",
      receivedAt: { gte: startDate },
    },
    select: { amount: true, receivedAt: true, method: true, gateway: true },
  });

  // Fetch all invoices
  const invoices = await db.invoice.findMany({
    where: { tenantId: ctx.tenantId },
    select: { status: true, total: true, amountPaid: true, issueDate: true, dueDate: true },
  });

  // Monthly revenue breakdown
  const monthlyData = new Map<string, { revenue: number; invoiceCount: number }>();
  for (const p of payments) {
    const monthKey = `${p.receivedAt.getFullYear()}-${String(p.receivedAt.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyData.get(monthKey) ?? { revenue: 0, invoiceCount: 0 };
    existing.revenue += p.amount.toNumber();
    existing.invoiceCount++;
    monthlyData.set(monthKey, existing);
  }

  // Fill in missing months with zero
  const months: Array<{ month: string; revenue: number; invoiceCount: number }> = [];
  const iter = new Date(startDate);
  while (iter <= now) {
    const key = `${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, "0")}`;
    const data = monthlyData.get(key) ?? { revenue: 0, invoiceCount: 0 };
    months.push({
      month: iter.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      revenue: data.revenue,
      invoiceCount: data.invoiceCount,
    });
    iter.setMonth(iter.getMonth() + 1);
  }

  // Revenue by method
  const byMethod = new Map<string, number>();
  for (const p of payments) {
    const key = p.method;
    byMethod.set(key, (byMethod.get(key) ?? 0) + p.amount.toNumber());
  }

  // Revenue by gateway
  const byGateway = new Map<string, number>();
  for (const p of payments) {
    const key = p.gateway ?? "manual";
    byGateway.set(key, (byGateway.get(key) ?? 0) + p.amount.toNumber());
  }

  // Summary stats
  const totalRevenue = payments.reduce((s, p) => s + p.amount.toNumber(), 0);
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter((i) => i.status === "paid").length;
  const outstandingInvoices = invoices.filter((i) => ["issued", "partial", "overdue"].includes(i.status));
  const outstandingAmount = outstandingInvoices.reduce((s, i) => s + (i.total.toNumber() - i.amountPaid.toNumber()), 0);
  const overdueAmount = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + (i.total.toNumber() - i.amountPaid.toNumber()), 0);

  // MRR: last month's revenue
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mrr = payments
    .filter((p) => p.receivedAt >= lastMonthStart && p.receivedAt < thisMonthStart)
    .reduce((s, p) => s + p.amount.toNumber(), 0);
  const arr = mrr * 12;

  // Current month revenue
  const currentMonthRevenue = payments
    .filter((p) => p.receivedAt >= thisMonthStart)
    .reduce((s, p) => s + p.amount.toNumber(), 0);

  // Avg revenue per subscriber
  const activeSubscribers = await db.subscriber.count({ where: { tenantId: ctx.tenantId, status: "active" } });
  const arpu = activeSubscribers > 0 ? mrr / activeSubscribers : 0;

  return ok({
    summary: {
      totalRevenue,
      mrr,
      arr,
      currentMonthRevenue,
      arpu,
      totalInvoices,
      paidInvoices,
      outstandingCount: outstandingInvoices.length,
      outstandingAmount,
      overdueAmount,
      activeSubscribers,
    },
    monthlyData: months,
    byMethod: Array.from(byMethod.entries()).map(([method, amount]) => ({ method, amount })),
    byGateway: Array.from(byGateway.entries()).map(([gateway, amount]) => ({ gateway, amount })),
  });
});
