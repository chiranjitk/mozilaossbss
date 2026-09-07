// =====================================================================
// ALERTS CLIENT — list, acknowledge, resolve
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCircle2, AlertTriangle, AlertOctagon, Info, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertItem {
  id: string; alertNo: string; title: string; description: string | null;
  severity: string; status: string; category: string; source: string | null;
  threshold: number | null; currentValue: number | null;
  triggeredAt: string; acknowledgedAt: string | null; acknowledgedBy: string | null;
  resolvedAt: string | null; resolution: string | null;
}

async function fetchAlerts(params: { page: number; pageSize: number; search: string; status: string; severity: string }): Promise<{ data: AlertItem[]; total: number }> {
  const url = new URL("/api/v1/alerts", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.severity && params.severity !== "all") url.searchParams.set("severity", params.severity);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const SEVERITY_ICONS: Record<string, typeof Info> = {
  info: Info, warning: AlertTriangle, error: AlertOctagon, critical: AlertOctagon,
};
const SEVERITY_COLORS: Record<string, string> = {
  info: "text-info", warning: "text-warning", error: "text-destructive", critical: "text-destructive",
};

export function AlertsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [resolveTarget, setResolveTarget] = useState<AlertItem | null>(null);
  const [resolution, setResolution] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["alerts", { page, pageSize, search, statusFilter, severityFilter }],
    queryFn: () => fetchAlerts({ page, pageSize, search, status: statusFilter, severity: severityFilter }),
    placeholderData: (prev) => prev,
  });

  const ackMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/alerts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge" }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["alerts"] }); toast.success("Alert acknowledged"); },
    onError: () => toast.error("Failed to acknowledge"),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) => {
      const res = await fetch(`/api/v1/alerts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve", resolution }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["alerts"] }); toast.success("Alert resolved"); setResolveTarget(null); setResolution(""); },
    onError: () => toast.error("Failed to resolve"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<AlertItem>[]>(() => [
    {
      id: "severity",
      header: "",
      cell: ({ row }) => {
        const Icon = SEVERITY_ICONS[row.original.severity] ?? Info;
        return <Icon className={cn("h-4 w-4", SEVERITY_COLORS[row.original.severity] ?? "text-muted-foreground")} />;
      },
    },
    {
      id: "alertNo",
      header: "Alert #",
      cell: ({ row }) => <code className="text-xs font-mono text-brand">{row.original.alertNo}</code>,
    },
    {
      id: "title",
      header: "Title",
      cell: ({ row }) => (
        <div className="max-w-xs">
          <p className="text-sm font-medium truncate">{row.original.title}</p>
          {row.original.description && <p className="text-xs text-muted-foreground line-clamp-1">{row.original.description}</p>}
        </div>
      ),
    },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => <span className={cn("text-xs font-medium capitalize", SEVERITY_COLORS[row.original.severity] ?? "text-muted-foreground")}>{row.original.severity}</span>,
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => row.original.source ? <code className="text-xs font-mono text-muted-foreground">{row.original.source}</code> : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      id: "triggered",
      header: "Triggered",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(row.original.triggeredAt), { addSuffix: true })}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          {row.original.status === "active" && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => ackMutation.mutate(row.original.id)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Acknowledge
            </Button>
          )}
          {["active", "acknowledged"].includes(row.original.status) && (
            <Button variant="ghost" size="sm" className="h-8 text-success hover:text-success" onClick={() => setResolveTarget(row.original)}>
              Resolve
            </Button>
          )}
        </div>
      ),
    },
  ], [ackMutation]);

  return (
    <>
      <PageHeader title="Alerts" description="Monitor and manage system alerts. Acknowledge active alerts and track resolution." actions={<Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh</Button>} />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Bell className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><AlertTriangle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((a) => a.status === "active").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((a) => a.status === "acknowledged").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Acknowledged</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((a) => a.status === "resolved").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resolved</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="acknowledged">Acknowledged</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="suppressed">Suppressed</SelectItem></SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All severity</SelectItem><SelectItem value="info">Info</SelectItem><SelectItem value="warning">Warning</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search alerts…" emptyMessage="No alerts" emptyDescription="Alerts will appear here when thresholds are exceeded." />

      <Dialog open={!!resolveTarget} onOpenChange={(o) => { if (!o) { setResolveTarget(null); setResolution(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> Resolve Alert</DialogTitle><DialogDescription>Resolve {resolveTarget?.alertNo}: {resolveTarget?.title}</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="res">Resolution Notes</Label><Textarea id="res" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="How was this alert resolved?" rows={3} /></div>
          <DialogFooter><Button variant="outline" onClick={() => { setResolveTarget(null); setResolution(""); }}>Cancel</Button><Button disabled={resolveMutation.isPending || !resolution} onClick={() => resolveTarget && resolveMutation.mutate({ id: resolveTarget.id, resolution })}>{resolveMutation.isPending ? "Resolving…" : "Resolve"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
