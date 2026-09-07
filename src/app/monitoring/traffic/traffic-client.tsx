// =====================================================================
// TRAFFIC ANALYTICS CLIENT — top talkers + NAS breakdown
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { TrendingUp, TrendingDown, Wifi, Server, BarChart3, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const formatBytes = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
};

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export function TrafficClient() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["traffic-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/v1/metrics?view=dashboard&metric=bandwidth_down", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch traffic data");
      return res.json();
    },
    refetchInterval: 15000,
  });

  if (isLoading) return (<><PageHeader title="Traffic Analytics" /><LoadingState label="Loading traffic data…" /></>);
  if (isError || !data) return (<><PageHeader title="Traffic Analytics" /><ErrorState onRetry={() => refetch()} /></>);

  const topTalkers = data.topTalkers ?? [];
  const trafficByNas = data.trafficByNas ?? [];

  // Calculate totals
  const totalDown = trafficByNas.reduce((s: number, n: any) => s + n.totalDown, 0);
  const totalUp = trafficByNas.reduce((s: number, n: any) => s + n.totalUp, 0);
  const totalSessions = trafficByNas.reduce((s: number, n: any) => s + n.sessionCount, 0);

  return (
    <>
      <PageHeader title="Traffic Analytics" description="Top talkers, NAS traffic breakdown, and session statistics. Updates every 15 seconds." />

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><TrendingDown className="h-4 w-4" /></div>
            <div><p className="text-xl font-semibold tabular-nums">{formatBytes(totalDown)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Download</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><TrendingUp className="h-4 w-4" /></div>
            <div><p className="text-xl font-semibold tabular-nums">{formatBytes(totalUp)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Upload</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><Wifi className="h-4 w-4" /></div>
            <div><p className="text-xl font-semibold tabular-nums">{totalSessions}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active Sessions</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info"><Activity className="h-4 w-4" /></div>
            <div><p className="text-xl font-semibold tabular-nums">{topTalkers.length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Top Talkers</p></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Top Talkers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-brand" /> Top Talkers
            </CardTitle>
            <CardDescription>Subscribers consuming the most bandwidth</CardDescription>
          </CardHeader>
          <CardContent>
            {topTalkers.length === 0 ? (
              <EmptyState title="No active sessions" description="Top talkers will appear here when subscribers are online." icon={Wifi} />
            ) : (
              <div className="space-y-3">
                {topTalkers.map((t: any, i: number) => {
                  const maxOctets = topTalkers[0]?.totalOctets ?? 1;
                  const pct = (t.totalOctets / maxOctets) * 100;
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold", i === 0 ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                          <div>
                            <p className="font-medium">{t.username}</p>
                            <p className="text-xs text-muted-foreground">{t.nasName} · {formatDuration(t.duration)}</p>
                          </div>
                        </div>
                        <span className="text-xs tabular-nums font-medium">{formatBytes(t.totalOctets)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full", i === 0 ? "bg-brand" : i === 1 ? "bg-brand/70" : "bg-brand/40")} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                        <span>↓ {formatBytes(t.outputOctets)}</span>
                        <span>↑ {formatBytes(t.inputOctets)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* NAS Traffic Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4 text-brand" /> NAS Traffic Breakdown
            </CardTitle>
            <CardDescription>Traffic distribution across NAS devices</CardDescription>
          </CardHeader>
          <CardContent>
            {trafficByNas.length === 0 ? (
              <EmptyState title="No NAS data" description="Add NAS clients to see traffic breakdown." icon={Server} />
            ) : (
              <div className="space-y-4">
                {trafficByNas.map((nas: any, i: number) => {
                  const total = nas.totalDown + nas.totalUp;
                  const maxTotal = Math.max(...trafficByNas.map((n: any) => n.totalDown + n.totalUp), 1);
                  const pct = (total / maxTotal) * 100;
                  return (
                    <div key={i} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium">{nas.nasName}</p>
                          <code className="text-xs text-muted-foreground font-mono">{nas.nasIp}</code>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{nas.sessionCount} sessions</Badge>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden mb-2">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3 text-muted-foreground" />{formatBytes(nas.totalDown)}</span>
                        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-muted-foreground" />{formatBytes(nas.totalUp)}</span>
                        <span className="text-muted-foreground">Total: {formatBytes(total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
