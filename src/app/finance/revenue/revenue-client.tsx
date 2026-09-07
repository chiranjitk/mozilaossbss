// =====================================================================
// REVENUE REPORTS CLIENT — charts + KPIs + payment breakdowns
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/common/metric-card";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend } from "recharts";
import { DollarSign, TrendingUp, Clock, Users, Landmark, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const formatCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const PIE_COLORS = ["var(--brand)", "var(--success)", "var(--info)", "var(--warning)", "var(--muted-foreground)"];

export function RevenueClient() {
  const [range, setRange] = useState("12m");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["finance-revenue", range],
    queryFn: async () => {
      const res = await fetch(`/api/v1/finance?range=${range}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading) return (<><PageHeader title="Revenue Reports" /><LoadingState /></>);
  if (isError || !data) return (<><PageHeader title="Revenue Reports" /><ErrorState onRetry={() => refetch()} /></>);

  const s = data.data.summary;
  const monthly = data.data.monthlyData ?? [];
  const byMethod = data.data.byMethod ?? [];
  const byGateway = data.data.byGateway ?? [];

  return (
    <>
      <PageHeader title="Revenue Reports" description="Revenue analytics, MRR/ARR, and payment breakdowns." actions={<Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh</Button>} />

      {/* Range selector */}
      <div className="flex items-center gap-2 mb-5">
        {["3m", "6m", "ytd", "12m", "all"].map((r) => (
          <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>{r === "ytd" ? "YTD" : r === "12m" ? "12 Months" : r === "3m" ? "3 Months" : r === "6m" ? "6 Months" : "All Time"}</Button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <MetricCard label="Total Revenue" value={formatCurrency(s.totalRevenue)} icon={DollarSign} accent="brand" hint={`Over ${range}`} />
        <MetricCard label="Monthly Recurring (MRR)" value={formatCurrency(s.mrr)} icon={TrendingUp} accent="success" hint={`ARR: ${formatCurrency(s.arr)}`} />
        <MetricCard label="Outstanding" value={formatCurrency(s.outstandingAmount)} icon={Clock} accent="warning" hint={`${s.outstandingCount} invoices`} />
        <MetricCard label="ARPU" value={formatCurrency(s.arpu)} icon={Users} hint={`${s.activeSubscribers} active subscribers`} />
      </div>

      {/* Revenue chart */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-brand" /> Monthly Revenue</CardTitle>
          <CardDescription>Revenue collected per month over the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthly} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px" }} formatter={(v: any) => formatCurrency(Number(v))} />
              <Bar dataKey="revenue" name="Revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Breakdown row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* By method */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><DollarSign className="h-4 w-4 text-brand" /> Revenue by Payment Method</CardTitle><CardDescription>Distribution across payment methods</CardDescription></CardHeader>
          <CardContent>
            {byMethod.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byMethod} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={80} label={(entry: any) => `${entry.method}: ${formatCurrency(entry.amount)}`}>
                    {byMethod.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground py-12 text-center">No payment data for this period</p>}
          </CardContent>
        </Card>

        {/* By gateway */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Landmark className="h-4 w-4 text-brand" /> Revenue by Gateway</CardTitle><CardDescription>Distribution across payment gateways</CardDescription></CardHeader>
          <CardContent>
            {byGateway.length > 0 ? (
              <div className="space-y-3">
                {byGateway.sort((a: any, b: any) => b.amount - a.amount).map((g: any, i: number) => {
                  const max = byGateway[0].amount;
                  const pct = (g.amount / max) * 100;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{g.gateway}</span>
                        <span className="tabular-nums font-medium">{formatCurrency(g.amount)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full", i === 0 ? "bg-brand" : i === 1 ? "bg-brand/70" : "bg-brand/40")} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground py-12 text-center">No gateway data for this period</p>}
          </CardContent>
        </Card>
      </div>

      {/* Additional stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-5">
        <Card className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Invoices</p>
            <p className="text-xl font-semibold tabular-nums">{s.totalInvoices}</p>
            <p className="text-xs text-success">{s.paidInvoices} paid</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">This Month</p>
            <p className="text-xl font-semibold tabular-nums">{formatCurrency(s.currentMonthRevenue)}</p>
            <p className="text-xs text-muted-foreground">Collected so far</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Overdue Amount</p>
            <p className="text-xl font-semibold tabular-nums text-destructive">{formatCurrency(s.overdueAmount)}</p>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </div>
        </Card>
      </div>
    </>
  );
}
