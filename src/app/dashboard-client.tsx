// =====================================================================
// DASHBOARD CLIENT — fetches real KPIs, renders metric cards + chart + activity
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/common/metric-card";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import {
  Users,
  Radio,
  Server,
  DollarSign,
  AlertTriangle,
  ReceiptText,
  Activity,
  TrendingUp,
  Boxes,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDistanceToNow } from "date-fns";

interface DashboardData {
  tenant: { id: string; name: string; slug: string; currency: string; locale: string; timezone: string };
  user: { id: string; roles: string[] };
  modules: Array<{
    id: string;
    name: string;
    category: string;
    enabled: boolean;
    health: string;
    workerStatus: string;
    core: boolean;
  }>;
  metrics: {
    subscribers: { total: number; active: number; suspended: number };
    sessions: { active: number; capacity: number };
    network: { onlineNas: number };
    billing: { pendingInvoices: number; overdueInvoices: number };
    payments: { revenueToday: number; revenueMonth: number; paymentsToday: number };
    operations: { openComplaints: number; openIncidents: number };
    audit: { eventsLast24h: number };
  };
  recentActivity: Array<{
    id: string;
    action: string;
    module: string;
    resource: string;
    status: string;
    message: string | null;
    createdAt: string;
    userId: string | null;
  }>;
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/v1/dashboard", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load dashboard");
  return (await res.json()).data;
}

// Real bandwidth series (last 24h, hourly buckets) — replaces mock Math.sin data.
// Fetches both download & upload time-series from the monitoring metrics API.
interface BandwidthPoint {
  hour: string;
  download: number;
  upload: number;
}
async function fetchBandwidthSeries(currency: string): Promise<BandwidthPoint[]> {
  // interval=60 → hourly buckets over the last 24h
  const [downRes, upRes] = await Promise.all([
    fetch("/api/v1/metrics?view=dashboard&metric=bandwidth_down&range=24h&interval=60", { cache: "no-store" }),
    fetch("/api/v1/metrics?view=dashboard&metric=bandwidth_up&range=24h&interval=60", { cache: "no-store" }),
  ]);
  if (!downRes.ok || !upRes.ok) throw new Error("Failed to load bandwidth series");
  const [downJson, upJson] = await Promise.all([downRes.json(), upRes.json()]);
  const downPoints: Array<{ timestamp: string; value: number }> = downJson?.series?.points ?? [];
  const upPoints: Array<{ timestamp: string; value: number }> = upJson?.series?.points ?? [];
  // Merge by timestamp — download is the primary axis
  const upByTime = new Map(upPoints.map((p) => [p.timestamp, p.value]));
  const merged: BandwidthPoint[] = downPoints.map((p) => ({
    hour: new Date(p.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    download: Number((p.value ?? 0).toFixed(1)),
    upload: Number((upByTime.get(p.timestamp) ?? 0).toFixed(1)),
  }));
  return merged;
}

// Currency formatter driven by the tenant's configured currency (not hardcoded USD).
const currencyCache: Record<string, Intl.NumberFormat> = {};
const formatCurrency = (n: number, currency = "USD") => {
  if (!currencyCache[currency]) {
    try {
      currencyCache[currency] = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      // Fallback for invalid currency codes
      currencyCache[currency] = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
    }
  }
  return currencyCache[currency].format(n);
};

const formatNumber = (n: number) =>
  new Intl.NumberFormat("en-US").format(n);

export function DashboardClient() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });

  // Fetch real 24h bandwidth series once we know the dashboard loaded (needs tenant currency
  // only as a key dependency; the metrics API is independent of currency).
  const tenantCurrency = data?.tenant.currency ?? "USD";
  const bandwidthQuery = useQuery({
    queryKey: ["dashboard-bandwidth-24h", tenantCurrency],
    queryFn: () => fetchBandwidthSeries(tenantCurrency),
    enabled: !!data,
    refetchInterval: 60_000, // refresh every minute
  });
  const trafficData: BandwidthPoint[] = bandwidthQuery.data ?? [];

  if (isLoading) return <LoadingState label="Loading dashboard…" />;

  if (isError || !data) {
    return (
      <ErrorState
        title="Failed to load dashboard"
        description="There was an error fetching the dashboard data. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  const enabledModules = data.modules.filter((m) => m.enabled);
  const disabledModules = data.modules.filter((m) => !m.enabled);
  const sessionUtilization =
    data.metrics.sessions.capacity > 0
      ? (data.metrics.sessions.active / data.metrics.sessions.capacity) * 100
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome to Cryptsk`}
        description={`${data.tenant.name} · ${enabledModules.length} of ${data.modules.length} modules enabled`}
      />

      {/* Top KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active Sessions"
          value={formatNumber(data.metrics.sessions.active)}
          icon={Radio}
          accent="brand"
          hint={`Capacity: ${formatNumber(data.metrics.sessions.capacity)} · ${sessionUtilization.toFixed(2)}% utilized`}
          delta={{
            value: `${sessionUtilization.toFixed(1)}% capacity`,
            trend: "neutral",
          }}
        />
        <MetricCard
          label="Active Subscribers"
          value={formatNumber(data.metrics.subscribers.active)}
          icon={Users}
          accent="success"
          hint={`${formatNumber(data.metrics.subscribers.total)} total · ${data.metrics.subscribers.suspended} suspended`}
        />
        <MetricCard
          label="Online NAS"
          value={formatNumber(data.metrics.network.onlineNas)}
          icon={Server}
          hint="Network Access Servers reachable"
        />
        <MetricCard
          label="Revenue Today"
          value={formatCurrency(data.metrics.payments.revenueToday, tenantCurrency)}
          icon={DollarSign}
          accent="success"
          hint={`${formatCurrency(data.metrics.payments.revenueMonth, tenantCurrency)} this month · ${data.metrics.payments.paymentsToday} payments today`}
          delta={{
            value: "Live data",
            trend: "up",
          }}
        />
      </div>

      {/* Second KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Pending Invoices"
          value={formatNumber(data.metrics.billing.pendingInvoices)}
          icon={ReceiptText}
          accent="warning"
          hint="Awaiting payment"
        />
        <MetricCard
          label="Overdue Invoices"
          value={formatNumber(data.metrics.billing.overdueInvoices)}
          icon={AlertTriangle}
          accent="danger"
          hint="Past due date"
        />
        <MetricCard
          label="Open Complaints"
          value={formatNumber(data.metrics.operations.openComplaints)}
          icon={AlertTriangle}
          accent="warning"
          hint="Tickets awaiting resolution"
        />
        <MetricCard
          label="Audit Events (24h)"
          value={formatNumber(data.metrics.audit.eventsLast24h)}
          icon={Activity}
          hint="Actions recorded in last 24 hours"
        />
      </div>

      {/* Traffic + Activity row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Traffic chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-brand" />
              Bandwidth Utilization
            </CardTitle>
            <CardDescription>
              Aggregate upload / download across all NAS (last 24h, Mbps)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trafficData.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                {bandwidthQuery.isLoading ? "Loading bandwidth…" : bandwidthQuery.isError ? "Failed to load bandwidth" : "No bandwidth data yet"}
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trafficData} margin={{ left: -16, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="downloadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--muted-foreground)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--muted-foreground)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="download"
                  name="Download (Mbps)"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  fill="url(#downloadGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="upload"
                  name="Upload (Mbps)"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  fill="url(#uploadGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-brand" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest audit events</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentActivity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Audit events will appear here as you use the platform."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-border max-h-80 overflow-y-auto scroll-thin">
                {data.recentActivity.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="mt-0.5">
                      <StatusBadge
                        status={event.status}
                        label={event.status === "success" ? "✓" : event.status === "failure" ? "✗" : "·"}
                        className="px-1.5 py-0"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm text-foreground truncate">
                        <span className="font-medium">{event.action}</span>
                        {event.message ? ` · ${event.message}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event.module} · {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Module status row */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4 text-brand" />
            Module Status
          </CardTitle>
          <CardDescription>
            {enabledModules.length} enabled · {disabledModules.length} disabled
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.modules.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {m.category}
                    {m.core ? " · core" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!m.enabled && (
                    <span className="text-[10px] text-muted-foreground">disabled</span>
                  )}
                  {m.enabled && (
                    <StatusBadge
                      status={m.health}
                      label={m.health === "healthy" ? "healthy" : m.health}
                      className="px-1.5 py-0"
                    />
                  )}
                  {m.enabled && m.workerStatus === "running" && (
                    <span className="flex items-center gap-1 text-[10px] text-success">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      worker
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
