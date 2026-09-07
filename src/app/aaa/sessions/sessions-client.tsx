// =====================================================================
// ACTIVE SESSIONS CLIENT — real-time view + disconnect via CoA
// Auto-refreshes every 10s. Shows live session data from RADIUS accounting.
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Radio,
  Power,
  RefreshCw,
  Wifi,
  Globe,
  Clock,
  HardDrive,
  Server,
  CircleDot,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActiveSession {
  id: string;
  sessionId: string;
  subscriberId: string | null;
  subscriber: { customerId: string; name: string } | null;
  username: string;
  nas: { id: string; name: string; ipAddress: string; coaPort: number };
  nasIpAddress: string;
  framedIpAddress: string | null;
  callingStationId: string | null;
  calledStationId: string | null;
  nasPortId: string | null;
  protocol: string | null;
  sessionTimeout: number | null;
  startTime: string;
  duration: number;
  inputOctets: number;
  outputOctets: number;
  totalOctets: number;
}

interface WorkerHealth {
  running: boolean;
  status: string;
  uptime?: number;
}

async function fetchSessions(params: {
  page: number;
  pageSize: number;
  search: string;
  nasId: string;
}): Promise<{ data: ActiveSession[]; total: number }> {
  const url = new URL("/api/v1/sessions", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.nasId && params.nasId !== "all") url.searchParams.set("nasId", params.nasId);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch sessions");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchWorkerHealth(): Promise<WorkerHealth> {
  const res = await fetch("/api/radius-worker/health", { cache: "no-store" });
  if (!res.ok) return { running: false, status: "error" };
  const json = await res.json();
  return json.data;
}

async function disconnectSession(sessionId: string): Promise<void> {
  const res = await fetch("/api/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to disconnect session");
  }
}

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  const gb = bytes / 1e9;
  const mb = bytes / 1e6;
  const kb = bytes / 1e3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${kb.toFixed(0)} KB`;
};

export function ActiveSessionsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [nasFilter, setNasFilter] = useState("all");
  const [disconnectTarget, setDisconnectTarget] = useState<ActiveSession | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["sessions", { page, pageSize, search, nasFilter }],
    queryFn: () => fetchSessions({ page, pageSize, search, nasId: nasFilter }),
    placeholderData: (prev) => prev,
    refetchInterval: autoRefresh ? 10000 : false, // auto-refresh every 10s
  });

  const { data: workerHealth } = useQuery({
    queryKey: ["worker-health"],
    queryFn: fetchWorkerHealth,
    refetchInterval: 30000,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectSession,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Session disconnected", {
        description: data.nasResponded
          ? "NAS acknowledged via RADIUS CoA"
          : "Local disconnect (NAS did not respond)",
      });
      setDisconnectTarget(null);
    },
    onError: (e: Error) => toast.error("Disconnect failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<ActiveSession>[]>(
    () => [
      {
        id: "status",
        header: "",
        cell: () => (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
          </span>
        ),
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div>
              <p className="text-sm font-medium">{s.subscriber?.name ?? s.username}</p>
              <code className="text-xs text-muted-foreground font-mono">{s.username}</code>
            </div>
          );
        },
      },
      {
        id: "sessionId",
        header: "Session ID",
        cell: ({ row }) => (
          <code className="text-xs font-mono text-brand">
            {row.original.sessionId.length > 20
              ? `${row.original.sessionId.slice(0, 20)}…`
              : row.original.sessionId}
          </code>
        ),
      },
      {
        id: "nas",
        header: "NAS",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="font-medium">{row.original.nas.name}</p>
            <code className="text-muted-foreground font-mono">{row.original.nas.ipAddress}</code>
          </div>
        ),
      },
      {
        id: "ip",
        header: "IP / MAC",
        cell: ({ row }) => (
          <div className="text-xs">
            {row.original.framedIpAddress ? (
              <p className="flex items-center gap-1"><Globe className="h-3 w-3 text-muted-foreground" /><code className="font-mono">{row.original.framedIpAddress}</code></p>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            {row.original.callingStationId && (
              <p className="flex items-center gap-1 text-muted-foreground"><CircleDot className="h-3 w-3" /><code className="font-mono">{row.original.callingStationId}</code></p>
            )}
          </div>
        ),
      },
      {
        id: "duration",
        header: "Duration",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums font-medium flex items-center gap-1">
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
        id: "protocol",
        header: "Protocol",
        cell: ({ row }) => (
          row.original.protocol ? (
            <Badge variant="outline" className="text-[10px]">{row.original.protocol}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-destructive hover:text-destructive"
              onClick={() => setDisconnectTarget(row.original)}
            >
              <Power className="mr-1.5 h-3.5 w-3.5" /> Disconnect
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="Active Sessions"
        description="Real-time view of subscribers currently online. Updates every 10 seconds."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
            >
              <Radio className={cn("mr-2 h-3.5 w-3.5", autoRefresh && "animate-pulse")} />
              {autoRefresh ? "Live" : "Paused"}
            </Button>
          </div>
        }
      />

      {/* Stats + worker status */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <Wifi className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{data?.total ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active Sessions</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              workerHealth?.running ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            )}>
              <Server className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{workerHealth?.running ? "Running" : "Stopped"}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">RADIUS Worker</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold tabular-nums">
                {data?.data.reduce((sum, s) => sum + s.totalOctets, 0).toLocaleString()}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bytes Transferred</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {dataUpdatedAt ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true }) : "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last Updated</p>
            </div>
          </div>
        </Card>
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
        emptyMessage="No active sessions"
        emptyDescription="Subscribers will appear here when they connect via RADIUS."
      />

      {/* Disconnect confirm */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={(o) => !o && setDisconnectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Power className="h-5 w-5 text-destructive" />
              Disconnect session?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will send a RADIUS Disconnect-Request (CoA) to{" "}
              <span className="font-medium text-foreground">{disconnectTarget?.nas.name}</span> to immediately
              terminate the session for{" "}
              <span className="font-medium text-foreground">
                {disconnectTarget?.subscriber?.name ?? disconnectTarget?.username}
              </span>
              . The subscriber will need to re-authenticate to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={disconnectMutation.isPending}
              onClick={() => {
                if (disconnectTarget) {
                  disconnectMutation.mutate(disconnectTarget.sessionId);
                }
              }}
            >
              {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
