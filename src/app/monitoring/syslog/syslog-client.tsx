// =====================================================================
// SYSLOG CLIENT — log entries with severity filter
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { FileText, AlertOctagon, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyslogEntry {
  id: string; facility: string; severity: string; priority: number;
  message: string; hostname: string | null; sourceIp: string | null;
  tag: string | null; receivedAt: string;
}

async function fetchSyslog(params: { page: number; pageSize: number; search: string; severity: string; facility: string }): Promise<{ data: SyslogEntry[]; total: number }> {
  const url = new URL("/api/v1/syslog", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.severity && params.severity !== "all") url.searchParams.set("severity", params.severity);
  if (params.facility && params.facility !== "all") url.searchParams.set("facility", params.facility);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const SEVERITY_COLORS: Record<string, string> = {
  emergency: "bg-destructive/15 text-destructive border-destructive/30",
  alert: "bg-destructive/15 text-destructive border-destructive/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  notice: "bg-info/15 text-info border-info/30",
  info: "bg-muted text-muted-foreground border-border",
  debug: "bg-muted text-muted-foreground border-border",
};

const FACILITY_LABELS: Record<string, string> = {
  kernel: "Kernel", daemon: "Daemon", auth: "Auth", syslog: "Syslog", local0: "Local0", local1: "Local1", local2: "Local2", local3: "Local3", local4: "Local4", local5: "Local5", local6: "Local6", local7: "Local7",
};

export function SyslogClient() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [facilityFilter, setFacilityFilter] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["syslog", { page, pageSize, search, severityFilter, facilityFilter }],
    queryFn: () => fetchSyslog({ page, pageSize, search, severity: severityFilter, facility: facilityFilter }),
    placeholderData: (prev) => prev,
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<SyslogEntry>[]>(() => [
    {
      id: "severity",
      header: "Sev",
      cell: ({ row }) => (
        <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border", SEVERITY_COLORS[row.original.severity] ?? "bg-muted text-muted-foreground")}>
          {row.original.severity.slice(0, 4).toUpperCase()}
        </span>
      ),
    },
    {
      id: "facility",
      header: "Facility",
      cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{FACILITY_LABELS[row.original.facility] ?? row.original.facility}</Badge>,
    },
    {
      id: "message",
      header: "Message",
      cell: ({ row }) => (
        <div className="max-w-md">
          {row.original.tag && <span className="text-xs font-mono text-brand">{row.original.tag}: </span>}
          <span className="text-xs">{row.original.message}</span>
        </div>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => (
        <div className="text-xs">
          {row.original.hostname && <p>{row.original.hostname}</p>}
          {row.original.sourceIp && <code className="font-mono text-muted-foreground">{row.original.sourceIp}</code>}
          {!row.original.hostname && !row.original.sourceIp && <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: "time",
      header: "Time",
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{format(new Date(row.original.receivedAt), "MMM d, HH:mm:ss")}</span>,
    },
  ], []);

  return (
    <>
      <PageHeader title="Syslog" description="System log entries from NAS devices and infrastructure. Filter by severity and facility." actions={<Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh</Button>} />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><FileText className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Logs</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive"><AlertOctagon className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((e) => ["emergency", "alert", "critical", "error"].includes(e.severity)).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Errors</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><AlertTriangle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((e) => e.severity === "warning").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Warnings</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info"><Info className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((e) => ["info", "notice", "debug"].includes(e.severity)).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Info</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            <SelectItem value="emergency">Emergency</SelectItem>
            <SelectItem value="alert">Alert</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="notice">Notice</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
        <Select value={facilityFilter} onValueChange={(v) => { setFacilityFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Facility" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All facilities</SelectItem>
            {Object.entries(FACILITY_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search log messages…" emptyMessage="No syslog entries" emptyDescription="Log entries will appear here when NAS devices send syslog." />
    </>
  );
}
