// =====================================================================
// SESSION HISTORY CLIENT — filterable, exportable historical sessions
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, formatDistanceToNow } from "date-fns";
import { Download, History, Clock, Server, Activity } from "lucide-react";

interface HistorySession {
  id: string;
  sessionId: string;
  username: string;
  nas: { id: string; name: string; ipAddress: string };
  nasIpAddress: string;
  framedIpAddress: string | null;
  callingStationId: string | null;
  startTime: string;
  stopTime: string | null;
  duration: number | null;
  inputOctets: number;
  outputOctets: number;
  totalOctets: number;
  terminationCause: string | null;
}

interface HistoryResponse {
  data: HistorySession[];
  total: number;
}

async function fetchHistory(params: {
  page: number;
  pageSize: number;
  search: string;
  terminationCause: string;
}): Promise<HistoryResponse> {
  const url = new URL("/api/v1/session-history", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.terminationCause && params.terminationCause !== "all")
    url.searchParams.set("terminationCause", params.terminationCause);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch history");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

const TERMINATION_CAUSES = [
  "User-Request", "Lost-Carrier", "Lost-Service", "Idle-Timeout",
  "Session-Timeout", "Admin-Reset", "Admin-Reboot", "NAS-Error",
  "NAS-Reboot", "Port-Error",
];

export function HistoryClient() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [causeFilter, setCauseFilter] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["session-history", { page, pageSize, search, causeFilter }],
    queryFn: () => fetchHistory({ page, pageSize, search, terminationCause: causeFilter }),
    placeholderData: (prev) => prev,
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleExport = useCallback(() => {
    if (!data?.data.length) return;
    const headers = ["Session ID", "Username", "NAS", "IP", "MAC", "Start", "Stop", "Duration", "Input", "Output", "Termination"];
    const rows = data.data.map((s) => [
      s.sessionId, s.username, s.nas.name, s.framedIpAddress ?? "", s.callingStationId ?? "",
      new Date(s.startTime).toISOString(), s.stopTime ? new Date(s.stopTime).toISOString() : "",
      String(s.duration ?? 0), String(s.inputOctets), String(s.outputOctets), s.terminationCause ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const columns = useMemo<ColumnDef<HistorySession>[]>(
    () => [
      {
        id: "user",
        header: "User",
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{row.original.username}</p>
            <code className="text-xs text-muted-foreground font-mono">{row.original.sessionId.slice(0, 20)}{row.original.sessionId.length > 20 ? "…" : ""}</code>
          </div>
        ),
      },
      {
        id: "nas",
        header: "NAS",
        cell: ({ row }) => (
          <div className="text-xs">
            <p>{row.original.nas.name}</p>
            <code className="text-muted-foreground font-mono">{row.original.nas.ipAddress}</code>
          </div>
        ),
      },
      {
        id: "ip",
        header: "IP / MAC",
        cell: ({ row }) => (
          <div className="text-xs">
            {row.original.framedIpAddress && <p className="font-mono">{row.original.framedIpAddress}</p>}
            {row.original.callingStationId && <p className="font-mono text-muted-foreground">{row.original.callingStationId}</p>}
          </div>
        ),
      },
      {
        id: "start",
        header: "Start",
        cell: ({ row }) => (
          <div className="text-xs">
            <p>{format(new Date(row.original.startTime), "MMM d, HH:mm")}</p>
            <p className="text-muted-foreground">{formatDistanceToNow(new Date(row.original.startTime), { addSuffix: true })}</p>
          </div>
        ),
      },
      {
        id: "stop",
        header: "Stop",
        cell: ({ row }) =>
          row.original.stopTime ? (
            <span className="text-xs">{format(new Date(row.original.stopTime), "MMM d, HH:mm")}</span>
          ) : (
            <Badge variant="outline" className="text-[10px] text-warning border-warning/30">Active</Badge>
          ),
      },
      {
        id: "duration",
        header: "Duration",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {formatDuration(row.original.duration)}
          </span>
        ),
      },
      {
        id: "data",
        header: "Data ↓/↑",
        cell: ({ row }) => (
          <div className="text-xs tabular-nums">
            <p><span className="text-muted-foreground">↓</span> {formatBytes(row.original.outputOctets)}</p>
            <p><span className="text-muted-foreground">↑</span> {formatBytes(row.original.inputOctets)}</p>
          </div>
        ),
      },
      {
        id: "cause",
        header: "Termination",
        cell: ({ row }) =>
          row.original.terminationCause ? (
            <Badge
              variant="outline"
              className={
                row.original.terminationCause === "Admin-Reset"
                  ? "text-warning border-warning/30"
                  : row.original.terminationCause === "User-Request"
                    ? "text-muted-foreground"
                    : "text-foreground"
              }
            >
              {row.original.terminationCause}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="Session History"
        description="Historical session records with termination causes. Used for auditing and capacity analysis."
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data?.data.length}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={causeFilter} onValueChange={(v) => { setCauseFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-56">
            <SelectValue placeholder="Termination cause" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All causes</SelectItem>
            {TERMINATION_CAUSES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        error={error?.message}
        onRetry={() => refetch()}
        pagination={{ page, pageSize, total: data?.total ?? 0 }}
        onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }}
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by username, session ID, IP, or MAC…"
        emptyMessage="No session history"
        emptyDescription="Historical sessions will appear here after subscribers disconnect."
      />
    </>
  );
}
