// =====================================================================
// MIKROTIK DEVICES CLIENT — list MikroTik routers
// Columns: name/IP, model, firmware, status, lastSeen, actions (poll/reboot/delete)
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Router,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Power,
  Server,
  Activity,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeviceForm, type DeviceListItem } from "../_device-form";

async function fetchDevices(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  type: string;
}): Promise<{ data: DeviceListItem[]; total: number }> {
  const url = new URL("/api/v1/devices", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  url.searchParams.set("type", params.type);
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch devices");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveDevice(data: any): Promise<void> {
  const isEdit = !!data.id;
  const res = await fetch(isEdit ? `/api/v1/devices/${data.id}` : "/api/v1/devices", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save device");
  }
}

async function deleteDevice(id: string): Promise<void> {
  const res = await fetch(`/api/v1/devices/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete device");
  }
}

async function pollDevice(id: string): Promise<any> {
  const res = await fetch(`/api/v1/devices/${id}/poll`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Poll failed");
  }
  const json = await res.json();
  return json.data;
}

async function rebootDevice(id: string): Promise<void> {
  const res = await fetch(`/api/v1/devices/${id}/reboot`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Reboot failed");
  }
}

export function MikrotikDevicesClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DeviceListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeviceListItem | null>(null);
  const [rebootTarget, setRebootTarget] = useState<DeviceListItem | null>(null);
  const [pollingId, setPollingId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["devices", "mikrotik", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchDevices({ page, pageSize, search, status: statusFilter, type: "mikrotik" }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: saveDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Device saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Device deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const pollMutation = useMutation({
    mutationFn: pollDevice,
    onMutate: (id) => setPollingId(id),
    onSuccess: (result, id) => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["device", id] });
      if (result?.reachable) {
        toast.success("Device reachable", {
          description: `${result.name} · ${result.latencyMs}ms · uptime ${result.uptime}s`,
        });
      } else {
        toast.error("Device unreachable", {
          description: `${result?.name} marked offline · critical alert created`,
        });
      }
      setPollingId(null);
    },
    onError: (e: Error) => {
      toast.error("Poll failed", { description: e.message });
      setPollingId(null);
    },
  });

  const rebootMutation = useMutation({
    mutationFn: rebootDevice,
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["device", id] });
      toast.success("Reboot command emitted");
      setRebootTarget(null);
    },
    onError: (e: Error) => toast.error("Reboot failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<DeviceListItem>[]>(() => [
    {
      id: "name",
      header: "Router",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <button
            type="button"
            onClick={() => router.push(`/devices/${d.id}`)}
            className="flex items-center gap-3 text-left"
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                d.status === "online" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
              )}
            >
              <Router className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium hover:underline">{d.name}</p>
              <code className="text-xs text-muted-foreground font-mono">{d.ipAddress}:{d.managementPort}</code>
            </div>
          </button>
        );
      },
    },
    {
      id: "model",
      header: "Model",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="text-xs">
            <p className="font-medium">{d.model ?? "—"}</p>
            {d.vendor && <p className="text-muted-foreground">{d.vendor}</p>}
          </div>
        );
      },
    },
    {
      id: "firmware",
      header: "Firmware",
      cell: ({ row }) =>
        row.original.firmwareVersion ? (
          <code className="text-xs font-mono text-muted-foreground">
            RouterOS {row.original.firmwareVersion}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "alerts",
      header: "Alerts",
      cell: ({ row }) =>
        row.original.openAlertCount > 0 ? (
          <Badge className="bg-destructive/15 text-destructive border-destructive/30">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {row.original.openAlertCount} open
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">0 open</span>
        ),
    },
    {
      id: "lastSeen",
      header: "Last Seen",
      cell: ({ row }) =>
        row.original.lastSeenAt ? (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.lastSeenAt), { addSuffix: true })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Never</span>
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => pollMutation.mutate(d.id)}
              disabled={pollingId === d.id || d.status === "maintenance"}
              title="Poll now"
            >
              {pollingId === d.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setRebootTarget(d)}
              disabled={d.status === "maintenance"}
              title="Reboot"
            >
              <Power className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditTarget(d)}
              title="Edit"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(d)}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ], [pollMutation, pollingId, router]);

  const list = data?.data ?? [];
  const online = list.filter((d) => d.status === "online").length;
  const offline = list.filter((d) => d.status === "offline").length;
  const alerts = list.reduce((s, d) => s + d.openAlertCount, 0);

  return (
    <>
      <PageHeader
        title="MikroTik Devices"
        description="MikroTik routers managed via REST API. Poll reachability, push reboots, track firmware."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> Add MikroTik
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{data?.total ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">MikroTik Routers</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{online}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Online</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{offline}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Offline</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{alerts}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Alerts</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <StatusFilter value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} />
      </div>

      <DataTable
        columns={columns}
        data={list}
        isLoading={isLoading}
        isError={isError}
        error={error?.message}
        onRetry={() => refetch()}
        pagination={{ page, pageSize, total: data?.total ?? 0 }}
        onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }}
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by name, IP, vendor, or serial…"
        emptyMessage="No MikroTik devices"
        emptyDescription="Add your first router to begin polling and inventory management."
      />

      <Dialog
        open={createOpen || !!editTarget}
        onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "Add MikroTik Device"}</DialogTitle>
            <DialogDescription>
              Configure a MikroTik router for REST API management. Polling uses the credentials you supply.
            </DialogDescription>
          </DialogHeader>
          <DeviceForm
            device={editTarget}
            isSaving={saveMutation.isPending}
            defaultType="mikrotik"
            onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete device?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span> ({deleteTarget?.ipAddress})?
              All interfaces, alerts, and topology links will be removed. Child devices will be detached.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rebootTarget} onOpenChange={(o) => !o && setRebootTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reboot {rebootTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a reboot command to <span className="font-medium text-foreground">{rebootTarget?.name}</span> ({rebootTarget?.ipAddress}).
              Subscribers connected through this router will be disconnected during the boot cycle (~30–60s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rebootMutation.isPending}
              onClick={() => rebootTarget && rebootMutation.mutate(rebootTarget.id)}
            >
              {rebootMutation.isPending ? "Sending…" : "Reboot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatusFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Lightweight inline filter to avoid extra imports; matches /aaa/nas visual style.
  const options = [
    { value: "all", label: "All status" },
    { value: "online", label: "Online" },
    { value: "offline", label: "Offline" },
    { value: "maintenance", label: "Maintenance" },
    { value: "unmanaged", label: "Unmanaged" },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <Button
          key={o.value}
          variant={value === o.value ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
