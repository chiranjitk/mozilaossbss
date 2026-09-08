// =====================================================================
// COA EVENTS CLIENT — read-only CoA (Change-of-Authorization) events log
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, format } from "date-fns";
import {
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
} from "lucide-react";

interface CoaEvent {
  id: string;
  type: string;
  status: string;
  subscriberId: string | null;
  sessionId: string | null;
  nasIpAddress: string | null;
  coaPort: number;
  attributes: string | null;
  response: string | null;
  errorMessage: string | null;
  requestedBy: string | null;
  requestedAt: string;
  processedAt: string | null;
  createdAt: string;
}

const COA_TYPES: Record<string, string> = {
  plan_change: "Plan Change",
  bandwidth_change: "Bandwidth Change",
  session_disconnect: "Session Disconnect",
  session_timeout: "Session Timeout",
  fap_trigger: "FAP Trigger",
  topup_apply: "Top-up Apply",
};

async function fetchCoaEvents(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  type: string;
}): Promise<{ data: CoaEvent[]; total: number }> {
  const url = new URL("/api/v1/coa-events", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.type && params.type !== "all") url.searchParams.set("type", params.type);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch CoA events");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

export function CoaClient() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [detail, setDetail] = useState<CoaEvent | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["coa-events", { page, pageSize, search, statusFilter, typeFilter }],
    queryFn: () =>
      fetchCoaEvents({
        page,
        pageSize,
        search,
        status: statusFilter,
        type: typeFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<CoaEvent>[]>(
    () => [
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {COA_TYPES[row.original.type] ?? row.original.type}
          </Badge>
        ),
      },
      {
        id: "subscriber",
        header: "Subscriber",
        cell: ({ row }) =>
          row.original.subscriberId ? (
            <code className="text-xs font-mono">{row.original.subscriberId}</code>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "nas",
        header: "NAS",
        cell: ({ row }) =>
          row.original.nasIpAddress ? (
            <div className="text-xs">
              <code className="font-mono">{row.original.nasIpAddress}</code>
              <span className="text-muted-foreground">:{row.original.coaPort}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "requestedBy",
        header: "Requested By",
        cell: ({ row }) =>
          row.original.requestedBy ? (
            <span className="text-xs">{row.original.requestedBy}</span>
          ) : (
            <span className="text-xs text-muted-foreground">System</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "requestedAt",
        header: "Requested",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="text-foreground">
              {formatDistanceToNow(new Date(row.original.requestedAt), { addSuffix: true })}
            </p>
            <p className="text-muted-foreground">
              {format(new Date(row.original.requestedAt), "MMM d, HH:mm:ss")}
            </p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDetail(row.original)}
              aria-label="View details"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const events = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const successCount = events.filter((e) => e.status === "success").length;
  const failedCount = events.filter((e) => e.status === "failed" || e.status === "timeout").length;

  return (
    <>
      <PageHeader
        title="CoA Events"
        description="Audit log of Change-of-Authorization (CoA) requests sent to NAS devices — bandwidth updates, plan changes, session disconnects."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Events
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{successCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Success
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <XCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{failedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Failed
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {events.filter((e) => e.status === "requested").length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Pending
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="requested">Requested</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="timeout">Timeout</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(COA_TYPES).map(([val, label]) => (
              <SelectItem key={val} value={val}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={events}
        isLoading={isLoading}
        isError={isError}
        error={error?.message}
        onRetry={() => refetch()}
        pagination={{ page, pageSize, total: data?.total ?? 0 }}
        onPaginationChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by subscriber, session, NAS IP, or requester…"
        emptyMessage="No CoA events"
        emptyDescription="No Change-of-Authorization events have been recorded."
      />

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-brand" /> CoA Event Detail
            </DialogTitle>
            <DialogDescription>
              {detail && COA_TYPES[detail.type]} — sent{" "}
              {detail && format(new Date(detail.requestedAt), "MMM d, yyyy HH:mm:ss")}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
                  <StatusBadge status={detail.status} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CoA Port</p>
                  <p className="text-sm tabular-nums">{detail.coaPort}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Subscriber</p>
                  <code className="text-xs font-mono">{detail.subscriberId ?? "—"}</code>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Session ID</p>
                  <code className="text-xs font-mono">{detail.sessionId ?? "—"}</code>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">NAS IP</p>
                  <code className="text-xs font-mono">{detail.nasIpAddress ?? "—"}</code>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Requested By</p>
                  <p className="text-sm">{detail.requestedBy ?? "System"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Processed At</p>
                  <p className="text-sm">
                    {detail.processedAt
                      ? format(new Date(detail.processedAt), "MMM d, HH:mm:ss")
                      : "—"}
                  </p>
                </div>
              </div>

              {detail.attributes && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    CoA Attributes Sent
                  </p>
                  <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs overflow-x-auto max-h-40">
{formatJson(detail.attributes)}
                  </pre>
                </div>
              )}

              {detail.response && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    NAS Response
                  </p>
                  <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs overflow-x-auto max-h-40">
{formatJson(detail.response)}
                  </pre>
                </div>
              )}

              {detail.errorMessage && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <p className="text-xs font-medium text-destructive">Error</p>
                  </div>
                  <p className="text-xs text-destructive">{detail.errorMessage}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatJson(value: string | null): string {
  if (!value) return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
