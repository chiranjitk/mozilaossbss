// =====================================================================
// AUTHENTICATION LOGS CLIENT — audit log filtered to AAA module
// Shows RADIUS auth events: session starts, stops, disconnects, accepts, rejects
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
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
import { Download, FileKey, RefreshCw } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  module: string;
  resource: string;
  resourceId: string | null;
  status: string;
  message: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  user: { id: string; name: string | null; username: string; email: string } | null;
}

interface AuditResponse {
  data: AuditEntry[];
  total: number;
}

async function fetchAuthLogs(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<AuditResponse> {
  const url = new URL("/api/v1/audit", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  url.searchParams.set("module", "aaa");
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch auth logs");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

// Map RADIUS actions to friendly labels + colors
const ACTION_META: Record<string, { label: string; color: string }> = {
  "session.disconnect": { label: "Session Disconnect", color: "text-destructive" },
  "session.start": { label: "Session Start", color: "text-success" },
  "session.stop": { label: "Session Stop", color: "text-muted-foreground" },
  "nas.create": { label: "NAS Created", color: "text-info" },
  "nas.update": { label: "NAS Updated", color: "text-warning" },
  "nas.delete": { label: "NAS Deleted", color: "text-destructive" },
};

export function AuthLogsClient() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["auth-logs", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchAuthLogs({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleExport = useCallback(() => {
    if (!data?.data.length) return;
    const headers = ["Timestamp", "User", "Action", "Resource", "Status", "IP", "Message"];
    const rows = data.data.map((r) => [
      new Date(r.createdAt).toISOString(),
      r.user?.name ?? r.user?.username ?? "RADIUS",
      r.action,
      r.resource,
      r.status,
      r.ipAddress ?? "",
      r.message ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auth-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const columns = useMemo<ColumnDef<AuditEntry>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Timestamp",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="font-medium">{format(new Date(row.original.createdAt), "MMM d, HH:mm:ss")}</p>
            <p className="text-muted-foreground">
              {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => {
          const meta = ACTION_META[row.original.action];
          return (
            <code className={`text-xs font-mono ${meta?.color ?? "text-brand"}`}>
              {row.original.action}
            </code>
          );
        },
      },
      {
        id: "resource",
        header: "Resource",
        cell: ({ row }) => (
          <div className="text-xs">
            <p>{row.original.resource}</p>
            {row.original.resourceId && (
              <code className="text-[10px] text-muted-foreground font-mono">
                {row.original.resourceId.slice(0, 12)}…
              </code>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "message",
        header: "Message",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="text-muted-foreground line-clamp-2 max-w-md">{row.original.message ?? "—"}</p>
            {row.original.ipAddress && (
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                from {row.original.ipAddress}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "user",
        header: "Operator",
        cell: ({ row }) => (
          <div className="text-xs">
            <p>{row.original.user?.name ?? row.original.user?.username ?? "System"}</p>
            <p className="text-muted-foreground">{row.original.user?.email ?? "RADIUS worker"}</p>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="Authentication Logs"
        description="RADIUS authentication events, session disconnects, and NAS management actions."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!data?.data.length}>
              <Download className="mr-2 h-3.5 w-3.5" /> Export
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failure">Failure</SelectItem>
            <SelectItem value="error">Error</SelectItem>
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
        searchPlaceholder="Search action, message, resource…"
        emptyMessage="No authentication logs"
        emptyDescription="RADIUS auth events and session disconnects will appear here."
      />

      {data?.data.length === 0 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <FileKey className="h-3.5 w-3.5" />
          Authentication events are recorded when subscribers connect via RADIUS.
        </div>
      )}
    </>
  );
}
