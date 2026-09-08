// =====================================================================
// CAPTIVE PORTAL CLIENT — portals management + active sessions view
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
import { Switch } from "@/components/ui/switch";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Wifi,
  Plus,
  Edit,
  Trash2,
  Radio,
  Clock,
  Gauge,
  CheckCircle2,
} from "lucide-react";

interface PortalItem {
  id: string;
  name: string;
  enabled: boolean;
  loginMethod: string;
  sessionTimeout: number;
  bandwidthLimit: number | null;
  redirectUrl: string | null;
  welcomeMessage: string | null;
  template: string;
  logoUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
}

interface SessionItem {
  id: string;
  portalId: string | null;
  portal: { id: string; name: string; template: string } | null;
  macAddress: string;
  ipAddress: string;
  username: string | null;
  sessionId: string | null;
  authMethod: string;
  status: string;
  startTime: string;
  endTime: string | null;
  dataUsed: string;
  createdAt: string;
}

interface PortalFormValues {
  name: string;
  loginMethod: string;
  sessionTimeout: number;
  bandwidthLimit?: number | null;
  redirectUrl?: string;
  welcomeMessage?: string;
  template: string;
  status: "active" | "disabled";
  enabled: boolean;
}

const LOGIN_METHODS: Record<string, string> = {
  radius: "RADIUS",
  voucher: "Voucher",
  click_to_continue: "Click-to-Continue",
  mac_auth: "MAC Auth",
  social: "Social Login",
};

const TEMPLATES: Record<string, string> = {
  isp_default: "ISP Default",
  hotel: "Hotel",
  cafe: "Café",
  airport: "Airport",
  resort: "Resort",
  corporate: "Corporate",
  custom: "Custom",
};

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: string | number): string {
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function fetchPortals(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: PortalItem[]; total: number }> {
  const url = new URL("/api/v1/captive-portals", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch portals");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchSessions(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: SessionItem[]; total: number }> {
  const url = new URL("/api/v1/captive-portal-sessions", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch sessions");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function savePortal(values: PortalFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/captive-portals/${values.id}` : "/api/v1/captive-portals",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save portal");
  }
}

async function deletePortal(id: string): Promise<void> {
  const res = await fetch(`/api/v1/captive-portals/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete portal");
  }
}

async function togglePortal(id: string, enabled: boolean): Promise<void> {
  const res = await fetch(`/api/v1/captive-portals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error("Failed to toggle portal");
}

export function CaptivePortalClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PortalItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortalItem | null>(null);

  // Sessions state
  const [sPage, setSPage] = useState(1);
  const [sPageSize, setSPagesize] = useState(10);
  const [sSearch, setSSearch] = useState("");
  const [sStatus, setSStatus] = useState("active");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["captive-portals", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchPortals({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const sessionsQuery = useQuery({
    queryKey: ["captive-portal-sessions", { sPage, sPageSize, sSearch, sStatus }],
    queryFn: () =>
      fetchSessions({ page: sPage, pageSize: sPageSize, search: sSearch, status: sStatus }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: PortalFormValues & { id?: string }) => savePortal(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captive-portals"] });
      toast.success("Portal saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePortal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captive-portals"] });
      toast.success("Portal deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      togglePortal(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["captive-portals"] });
      const prev = queryClient.getQueryData<{ data: PortalItem[]; total: number }>([
        "captive-portals",
        { page, pageSize, search, statusFilter },
      ]);
      if (prev) {
        const next = {
          ...prev,
          data: prev.data.map((p) => (p.id === id ? { ...p, enabled } : p)),
        };
        queryClient.setQueryData(
          ["captive-portals", { page, pageSize, search, statusFilter }],
          next
        );
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(
          ["captive-portals", { page, pageSize, search, statusFilter }],
          ctx.prev
        );
      }
      toast.error("Toggle failed", { description: e.message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captive-portals"] });
    },
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleSSearchChange = useCallback((v: string) => {
    setSSearch(v);
    setSPage(1);
  }, []);

  const columns = useMemo<ColumnDef<PortalItem>[]>(
    () => [
      {
        id: "name",
        header: "Portal",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <Wifi className="h-3.5 w-3.5 text-brand shrink-0" />
              <p className="text-sm font-medium truncate">{row.original.name}</p>
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider pl-5">
              {TEMPLATES[row.original.template] ?? row.original.template}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "loginMethod",
        header: "Login Method",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-medium">
            {LOGIN_METHODS[row.original.loginMethod] ?? row.original.loginMethod}
          </Badge>
        ),
      },
      {
        accessorKey: "sessionTimeout",
        header: "Session Timeout",
        cell: ({ row }) => (
          <span className="text-xs flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {formatDuration(row.original.sessionTimeout)}
          </span>
        ),
      },
      {
        accessorKey: "bandwidthLimit",
        header: "Bandwidth",
        cell: ({ row }) =>
          row.original.bandwidthLimit ? (
            <span className="text-xs flex items-center gap-1">
              <Gauge className="h-3 w-3 text-muted-foreground" />
              {row.original.bandwidthLimit} kbps
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Unlimited</span>
          ),
      },
      {
        accessorKey: "enabled",
        header: "Enabled",
        cell: ({ row }) => (
          <Switch
            checked={row.original.enabled}
            onCheckedChange={(checked) =>
              toggleMutation.mutate({ id: row.original.id, enabled: checked })
            }
            aria-label="Toggle portal"
          />
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
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditTarget(row.original)}
              aria-label="Edit portal"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete portal"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [toggleMutation]
  );

  const sessionColumns = useMemo<ColumnDef<SessionItem>[]>(
    () => [
      {
        id: "portal",
        header: "Portal",
        cell: ({ row }) => (
          <div className="max-w-[140px]">
            <p className="text-xs font-medium truncate">
              {row.original.portal?.name ?? "—"}
            </p>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {row.original.portal?.template ?? ""}
            </span>
          </div>
        ),
      },
      {
        id: "mac",
        header: "MAC Address",
        cell: ({ row }) => (
          <code className="text-xs font-mono">{row.original.macAddress}</code>
        ),
      },
      {
        id: "ip",
        header: "IP Address",
        cell: ({ row }) => (
          <code className="text-xs font-mono text-muted-foreground">
            {row.original.ipAddress}
          </code>
        ),
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) =>
          row.original.username ? (
            <span className="text-xs">{row.original.username}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "authMethod",
        header: "Auth Method",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {LOGIN_METHODS[row.original.authMethod] ?? row.original.authMethod}
          </Badge>
        ),
      },
      {
        id: "dataUsed",
        header: "Data Used",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {formatBytes(row.original.dataUsed)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "started",
        header: "Started",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.startTime), { addSuffix: true })}
          </span>
        ),
      },
    ],
    []
  );

  const portals = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = portals.filter((p) => p.status === "active").length;
  const activeSessions = sessionsQuery.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Captive Portal"
        description="Configure WiFi captive portals for guest access with multiple authentication methods."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Portal
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Wifi className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Portals
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
              <p className="text-xl font-semibold tabular-nums">{activeCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Active
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <Radio className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{activeSessions}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Active Sessions
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
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={portals}
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
        searchPlaceholder="Search portal name or welcome message…"
        emptyMessage="No captive portals"
        emptyDescription="Create a portal to provide guest WiFi access."
      />

      {/* Active sessions */}
      <div className="mt-10">
        <PageHeader
          title="Captive Portal Sessions"
          description="Active and recent guest sessions across all portals."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
          <Select
            value={sStatus}
            onValueChange={(v) => {
              setSStatus(v);
              setSPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="disconnected">Disconnected</SelectItem>
              <SelectItem value="data_cap_reached">Data cap reached</SelectItem>
              <SelectItem value="admin_disconnect">Admin disconnect</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DataTable
          columns={sessionColumns}
          data={sessionsQuery.data?.data ?? []}
          isLoading={sessionsQuery.isLoading}
          isError={sessionsQuery.isError}
          error={sessionsQuery.error?.message}
          onRetry={() => sessionsQuery.refetch()}
          pagination={{
            page: sPage,
            pageSize: sPageSize,
            total: sessionsQuery.data?.total ?? 0,
          }}
          onPaginationChange={(p, ps) => {
            setSPage(p);
            setSPagesize(ps);
          }}
          search={sSearch}
          onSearchChange={handleSSearchChange}
          searchPlaceholder="Search by MAC, IP, user, or session ID…"
          emptyMessage="No sessions"
          emptyDescription="No captive portal sessions match the current filters."
        />
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-brand" /> New Captive Portal
            </DialogTitle>
            <DialogDescription>Configure a guest WiFi captive portal.</DialogDescription>
          </DialogHeader>
          <PortalForm
            isSaving={saveMutation.isPending}
            onSave={(values) => saveMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-brand" /> Edit Captive Portal
            </DialogTitle>
            <DialogDescription>
              Update <span className="font-medium text-foreground">{editTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <PortalForm
              key={editTarget.id}
              initial={editTarget}
              isSaving={saveMutation.isPending}
              onSave={(values) =>
                saveMutation.mutate({ ...values, id: editTarget.id })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete captive portal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> and
              detach its sessions. This action cannot be undone.
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
    </>
  );
}

// ---------------------------------------------------------------------
// FORM — used for both create and edit
// ---------------------------------------------------------------------

function PortalForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: PortalItem;
  isSaving: boolean;
  onSave: (values: PortalFormValues) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    loginMethod: initial?.loginMethod ?? "radius",
    sessionTimeout: (initial?.sessionTimeout ?? 86400).toString(),
    bandwidthLimit: initial?.bandwidthLimit?.toString() ?? "",
    redirectUrl: initial?.redirectUrl ?? "",
    welcomeMessage: initial?.welcomeMessage ?? "",
    template: initial?.template ?? "isp_default",
    status: (initial?.status as "active" | "disabled") ?? "active",
    enabled: initial?.enabled ?? true,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          loginMethod: form.loginMethod,
          sessionTimeout: parseInt(form.sessionTimeout, 10) || 86400,
          bandwidthLimit: form.bandwidthLimit
            ? parseInt(form.bandwidthLimit, 10)
            : null,
          redirectUrl: form.redirectUrl || undefined,
          welcomeMessage: form.welcomeMessage || undefined,
          template: form.template,
          status: form.status,
          enabled: form.enabled,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="p-name">Portal Name *</Label>
        <Input
          id="p-name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Hotel Lobby WiFi"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Login Method</Label>
          <Select
            value={form.loginMethod}
            onValueChange={(v) => setForm((p) => ({ ...p, loginMethod: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LOGIN_METHODS).map(([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Template</Label>
          <Select
            value={form.template}
            onValueChange={(v) => setForm((p) => ({ ...p, template: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TEMPLATES).map(([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-timeout">
            Session Timeout (sec)
            <span className="ml-1 text-[10px] text-muted-foreground">
              ({formatDuration(parseInt(form.sessionTimeout, 10) || 0)})
            </span>
          </Label>
          <Input
            id="p-timeout"
            type="number"
            min="60"
            value={form.sessionTimeout}
            onChange={(e) => setForm((p) => ({ ...p, sessionTimeout: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-bw">Bandwidth Limit (kbps)</Label>
          <Input
            id="p-bw"
            type="number"
            min="0"
            value={form.bandwidthLimit}
            onChange={(e) => setForm((p) => ({ ...p, bandwidthLimit: e.target.value }))}
            placeholder="Unlimited"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-redirect">Redirect URL</Label>
        <Input
          id="p-redirect"
          type="url"
          value={form.redirectUrl}
          onChange={(e) => setForm((p) => ({ ...p, redirectUrl: e.target.value }))}
          placeholder="https://example.com/welcome"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-welcome">Welcome Message</Label>
        <Textarea
          id="p-welcome"
          value={form.welcomeMessage}
          onChange={(e) => setForm((p) => ({ ...p, welcomeMessage: e.target.value }))}
          placeholder="Welcome to our network! Enjoy your stay."
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(v: "active" | "disabled") =>
              setForm((p) => ({ ...p, status: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 flex items-end">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <Switch
              checked={form.enabled}
              onCheckedChange={(c) => setForm((p) => ({ ...p, enabled: c }))}
            />
            <span>{form.enabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Portal"}
        </Button>
      </DialogFooter>
    </form>
  );
}
