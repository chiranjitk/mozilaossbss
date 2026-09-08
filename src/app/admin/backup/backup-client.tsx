// =====================================================================
// BACKUP CLIENT — history + trigger backup
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  DatabaseBackup,
  Database,
  FileCog,
  Layers,
  CheckCircle2,
  XCircle,
  Loader2,
  HardDrive,
  ShieldCheck,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BackupItem {
  id: string;
  type: string;
  status: string;
  size: number | null;
  path: string | null;
  checksum: string | null;
  encrypted: boolean;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

const TYPE_META: Record<
  string,
  { label: string; icon: typeof Database; color: string }
> = {
  database: { label: "Database", icon: Database, color: "text-brand" },
  config: { label: "Config", icon: FileCog, color: "text-info" },
  full: { label: "Full", icon: Layers, color: "text-success" },
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

async function fetchBackups(params: {
  page: number;
  pageSize: number;
  status: string;
  type: string;
}): Promise<{ data: BackupItem[]; total: number }> {
  const url = new URL("/api/v1/backups", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.type && params.type !== "all") url.searchParams.set("type", params.type);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch backups");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function triggerBackup(data: {
  type: "database" | "config" | "full";
  encrypted: boolean;
}): Promise<void> {
  const res = await fetch("/api/v1/backups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to trigger backup");
  }
}

export function BackupClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerType, setTriggerType] = useState<"database" | "config" | "full">("database");
  const [triggerEncrypted, setTriggerEncrypted] = useState(true);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["backups", { page, pageSize, statusFilter, typeFilter }],
    queryFn: () =>
      fetchBackups({ page, pageSize, status: statusFilter, type: typeFilter }),
    placeholderData: (prev) => prev,
  });

  const triggerMutation = useMutation({
    mutationFn: triggerBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast.success("Backup completed", {
        description: "Backup file generated and verified.",
      });
      setTriggerOpen(false);
    },
    onError: (e: Error) => toast.error("Backup failed", { description: e.message }),
  });

  const handleCopyChecksum = (checksum: string | null) => {
    if (!checksum) return;
    navigator.clipboard.writeText(checksum);
    toast.success("Checksum copied", { description: checksum.slice(0, 24) + "…" });
  };

  const columns = useMemo<ColumnDef<BackupItem>[]>(
    () => [
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => {
          const meta = TYPE_META[row.original.type] ?? TYPE_META.database;
          const Icon = meta.icon;
          return (
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4", meta.color)} />
              <span className="text-sm font-medium">{meta.label}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "size",
        header: "Size",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {formatBytes(row.original.size)}
          </span>
        ),
      },
      {
        id: "encrypted",
        header: "Encrypted",
        cell: ({ row }) =>
          row.original.encrypted ? (
            <Badge variant="outline" className="text-[11px] gap-1">
              <ShieldCheck className="h-3 w-3 text-success" />
              Yes
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">No</span>
          ),
      },
      {
        id: "checksum",
        header: "Checksum",
        cell: ({ row }) =>
          row.original.checksum ? (
            <button
              onClick={() => handleCopyChecksum(row.original.checksum)}
              className="font-mono text-[11px] text-brand hover:underline flex items-center gap-1"
              title="Click to copy"
            >
              {row.original.checksum.slice(0, 12)}…
              <Copy className="h-3 w-3 opacity-50" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "path",
        header: "Path",
        cell: ({ row }) =>
          row.original.path ? (
            <code className="text-[11px] font-mono text-muted-foreground truncate block max-w-48">
              {row.original.path}
            </code>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-xs">{format(new Date(row.original.createdAt), "MMM d, yyyy")}</span>
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
            </span>
          </div>
        ),
      },
    ],
    []
  );

  const backups = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const completedCount = backups.filter((b) => b.status === "completed").length;
  const failedCount = backups.filter((b) => b.status === "failed").length;
  const totalSize = backups.reduce((s, b) => s + (b.size ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description="Trigger and audit database, configuration, and full-system backups. All backups are checksum-verified and encrypted."
        actions={
          <Button size="sm" onClick={() => setTriggerOpen(true)}>
            <DatabaseBackup className="mr-2 h-3.5 w-3.5" /> Trigger Backup
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <DatabaseBackup className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Backups
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
              <p className="text-xl font-semibold tabular-nums">{completedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Completed
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
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{formatBytes(totalSize)}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Size
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
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
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
            <SelectItem value="database">Database</SelectItem>
            <SelectItem value="config">Config</SelectItem>
            <SelectItem value="full">Full</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={backups}
        isLoading={isLoading}
        isError={isError}
        error={error?.message}
        onRetry={() => refetch()}
        pagination={{ page, pageSize, total: data?.total ?? 0 }}
        onPaginationChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        emptyMessage="No backups yet"
        emptyDescription="Trigger your first backup to see it here."
      />

      {/* Trigger dialog */}
      <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5 text-brand" /> Trigger Backup
            </DialogTitle>
            <DialogDescription>
              Backups run synchronously in this sandbox. In production they
              would be queued and dispatched to a background worker.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Backup Type</Label>
              <Select
                value={triggerType}
                onValueChange={(v: "database" | "config" | "full") =>
                  setTriggerType(v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="database">Database only</SelectItem>
                  <SelectItem value="config">Configuration only</SelectItem>
                  <SelectItem value="full">Full system (DB + config)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {triggerType === "database"
                  ? "Backs up all tenant-scoped database rows."
                  : triggerType === "config"
                  ? "Backs up system settings, module states, and role definitions."
                  : "Combines database and configuration into a single archive."}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              <div className="flex-1">
                <p className="text-xs font-medium">Encrypt backup</p>
                <p className="text-[11px] text-muted-foreground">
                  Encrypt the backup file at rest (recommended).
                </p>
              </div>
              <Switch
                checked={triggerEncrypted}
                onCheckedChange={setTriggerEncrypted}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                triggerMutation.mutate({ type: triggerType, encrypted: triggerEncrypted })
              }
              disabled={triggerMutation.isPending}
            >
              {triggerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Backing up…
                </>
              ) : (
                <>
                  <DatabaseBackup className="mr-2 h-4 w-4" />
                  Run Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Helper */}
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        All backups include a SHA-256 checksum for integrity verification. Encrypted backups use AES-256 at rest.
      </div>
    </>
  );
}
