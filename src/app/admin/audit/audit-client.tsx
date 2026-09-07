// =====================================================================
// AUDIT CLIENT — filterable, paginated audit trail
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
import { RefreshCw, Download, ScrollText } from "lucide-react";

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
  user: {
    id: string;
    name: string | null;
    username: string;
    email: string;
  } | null;
}

interface AuditResponse {
  data: AuditEntry[];
  total: number;
}

async function fetchAudit(params: {
  page: number;
  pageSize: number;
  search: string;
  module: string;
  status: string;
}): Promise<AuditResponse> {
  const url = new URL("/api/v1/audit", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.module && params.module !== "all") url.searchParams.set("module", params.module);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch audit log");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const MODULES = [
  "core", "subscribers", "aaa", "network", "policy", "monitoring",
  "billing", "payments", "operations", "finance", "devices", "ai", "communication",
];

export function AuditClient() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["audit", { page, pageSize, search, moduleFilter, statusFilter }],
    queryFn: () =>
      fetchAudit({ page, pageSize, search, module: moduleFilter, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleExport = useCallback(() => {
    if (!data?.data.length) return;
    const headers = ["Timestamp", "User", "Action", "Module", "Resource", "Resource ID", "Status", "IP", "Message"];
    const rows = data.data.map((r) => [
      new Date(r.createdAt).toISOString(),
      r.user?.name ?? r.user?.username ?? "system",
      r.action,
      r.module,
      r.resource,
      r.resourceId ?? "",
      r.status,
      r.ipAddress ?? "",
      r.message ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
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
        id: "user",
        header: "User",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="font-medium">{row.original.user?.name ?? row.original.user?.username ?? "System"}</p>
            <p className="text-muted-foreground">{row.original.user?.email ?? "—"}</p>
          </div>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => (
          <code className="text-xs font-mono text-brand">{row.original.action}</code>
        ),
      },
      {
        accessorKey: "module",
        header: "Module",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] capitalize py-0">
            {row.original.module}
          </Badge>
        ),
      },
      {
        id: "resource",
        header: "Resource",
        cell: ({ row }) => (
          <div className="text-xs">
            <p>{row.original.resource}</p>
            {row.original.resourceId && (
              <code className="text-[10px] text-muted-foreground">{row.original.resourceId.slice(0, 12)}…</code>
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
        id: "details",
        header: "Message",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="text-muted-foreground line-clamp-1 max-w-xs">
              {row.original.message ?? "—"}
            </p>
            {row.original.ipAddress && (
              <p className="text-[10px] text-muted-foreground font-mono">{row.original.ipAddress}</p>
            )}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Immutable record of all sensitive actions across the platform."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!data?.data.length}
            >
              <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {MODULES.map((m) => (
              <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        emptyMessage="No audit entries"
        emptyDescription="Audit events will appear here as users interact with the platform."
      />

      {/* Footer info */}
      {data?.data.length === 0 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5" />
          All sensitive operations are automatically recorded here.
        </div>
      )}
    </>
  );
}
