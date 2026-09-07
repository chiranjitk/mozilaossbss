// =====================================================================
// TAX/GST CLIENT — tax summary with monthly breakdown chart
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/common/metric-card";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Receipt, DollarSign, Percent, FileText, RefreshCw } from "lucide-react";

const formatCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function TaxClient() {
  const [range, setRange] = useState("12m");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["finance-tax", range],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tax?range=${range}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading) return (<><PageHeader title="Tax / GST" /><LoadingState /></>);
  if (isError || !data) return (<><PageHeader title="Tax / GST" /><ErrorState onRetry={() => refetch()} /></>);

  const s = data.data.summary;
  const monthly = data.data.monthlyData ?? [];

  return (
    <>
      <PageHeader title="Tax / GST" description="Tax collection summary with monthly breakdown. Track GST/VAT collected from invoices." actions={<Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh</Button>} />

      {/* Range selector */}
      <div className="flex items-center gap-2 mb-5">
        {["3m", "6m", "ytd", "12m"].map((r) => (
          <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>{r === "ytd" ? "YTD" : r === "12m" ? "12 Months" : r === "3m" ? "3 Months" : "6 Months"}</Button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <MetricCard label="Total Subtotal" value={formatCurrency(s.totalSubtotal)} icon={DollarSign} accent="brand" hint="Pre-tax revenue" />
        <MetricCard label="Total Tax Collected" value={formatCurrency(s.totalTax)} icon={Receipt} accent="warning" hint="GST/VAT collected" />
        <MetricCard label="Total Revenue (incl. Tax)" value={formatCurrency(s.totalRevenue)} icon={Receipt} accent="success" />
        <MetricCard label="Avg Tax Rate" value={`${s.avgTaxRate.toFixed(2)}%`} icon={Percent} hint={`${s.invoiceCount} invoices`} />
      </div>

      {/* Tax chart */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><Receipt className="h-4 w-4 text-brand" /> Monthly Tax Breakdown</CardTitle>
          <CardDescription>Subtotal vs Tax collected per month</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthly} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} formatter={(v: any) => formatCurrency(Number(v))} />
              <Legend />
              <Bar dataKey="subtotal" name="Subtotal" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="taxAmount" name="Tax" fill="var(--brand)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly table */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-brand" /> Monthly Tax Details</CardTitle><CardDescription>Detailed breakdown per month</CardDescription></CardHeader>
        <CardContent>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left font-medium py-2 pr-3">Month</th>
                  <th className="text-right font-medium py-2 pr-3">Subtotal</th>
                  <th className="text-right font-medium py-2 pr-3">Tax Amount</th>
                  <th className="text-right font-medium py-2 pr-3">Total</th>
                  <th className="text-right font-medium py-2">Tax Rate</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m: any, i: number) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-3">{m.month}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(m.subtotal)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-warning font-medium">{formatCurrency(m.taxAmount)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(m.total)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{m.taxRate.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(s.totalSubtotal)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-warning">{formatCurrency(s.totalTax)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(s.totalRevenue)}</td>
                  <td className="py-2 text-right tabular-nums">{s.avgTaxRate.toFixed(2)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
