// =====================================================================
// RADIUS PROXY CLIENT — servers + realms in tabs
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Server,
  Shuffle,
  Plus,
  Edit,
  Trash2,
  Network as NetworkIcon,
  KeyRound,
  Globe,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

interface ProxyServerItem {
  id: string;
  name: string;
  ipAddress: string;
  authPort: number;
  acctPort: number;
  type: string;
  timeout: number;
  status: string;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProxyServerDetail extends ProxyServerItem {
  secret: string;
}

interface RealmItem {
  id: string;
  realm: string;
  type: string;
  serverId: string;
  server: {
    id: string;
    name: string;
    ipAddress: string;
    status: string;
  } | null;
  stripRealm: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------

async function fetchServers(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: ProxyServerItem[]; total: number }> {
  const url = new URL("/api/v1/radius-proxy-servers", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch proxy servers");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchRealms(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: RealmItem[]; total: number }> {
  const url = new URL("/api/v1/radius-proxy-realms", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch realms");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveServer(values: any): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/radius-proxy-servers/${values.id}` : "/api/v1/radius-proxy-servers",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save server");
  }
}

async function deleteServer(id: string): Promise<void> {
  const res = await fetch(`/api/v1/radius-proxy-servers/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete server");
  }
}

async function saveRealm(values: any): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/radius-proxy-realms/${values.id}` : "/api/v1/radius-proxy-realms",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save realm");
  }
}

async function deleteRealm(id: string): Promise<void> {
  const res = await fetch(`/api/v1/radius-proxy-realms/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete realm");
  }
}

const SERVER_TYPES: Record<string, string> = {
  auth: "Auth Only",
  acct: "Accounting Only",
  both: "Auth + Acct",
};

const REALM_TYPES: Record<string, string> = {
  auth: "Auth",
  acct: "Acct",
  both: "Auth + Acct",
};

// ---------------------------------------------------------------------
// Main Client
// ---------------------------------------------------------------------

export function ProxyClient() {
  return (
    <>
      <PageHeader
        title="RADIUS Proxy"
        description="Proxy authentication and accounting requests to upstream RADIUS servers based on realm routing."
      />
      <Tabs defaultValue="servers" className="w-full">
        <TabsList>
          <TabsTrigger value="servers" className="gap-1.5">
            <Server className="h-3.5 w-3.5" /> Servers
          </TabsTrigger>
          <TabsTrigger value="realms" className="gap-1.5">
            <Shuffle className="h-3.5 w-3.5" /> Realms
          </TabsTrigger>
        </TabsList>
        <TabsContent value="servers" className="mt-4">
          <ServersTab />
        </TabsContent>
        <TabsContent value="realms" className="mt-4">
          <RealmsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ---------------------------------------------------------------------
// SERVERS TAB
// ---------------------------------------------------------------------

function ServersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProxyServerItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProxyServerItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["radius-proxy-servers", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchServers({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: any) => saveServer(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radius-proxy-servers"] });
      toast.success("Server saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radius-proxy-servers"] });
      toast.success("Server deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<ProxyServerItem>[]>(
    () => [
      {
        id: "name",
        header: "Server",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-brand shrink-0" />
              <p className="text-sm font-medium truncate">{row.original.name}</p>
            </div>
            <code className="text-xs font-mono text-muted-foreground pl-5">
              {row.original.ipAddress}
            </code>
          </div>
        ),
      },
      {
        accessorKey: "authPort",
        header: "Auth Port",
        cell: ({ row }) => (
          <code className="text-xs font-mono">{row.original.authPort}</code>
        ),
      },
      {
        accessorKey: "acctPort",
        header: "Acct Port",
        cell: ({ row }) => (
          <code className="text-xs font-mono">{row.original.acctPort}</code>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {SERVER_TYPES[row.original.type] ?? row.original.type}
          </Badge>
        ),
      },
      {
        accessorKey: "timeout",
        header: "Timeout",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.timeout}s</span>
        ),
      },
      {
        id: "secret",
        header: "Secret",
        cell: () => (
          <span className="text-xs flex items-center gap-1 text-muted-foreground">
            <KeyRound className="h-3 w-3" /> ••••••••
          </span>
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
              aria-label="Edit server"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete server"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const servers = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = servers.filter((s) => s.status === "active").length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <NetworkIcon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Servers
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <Server className="h-4 w-4" />
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
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {new Set(servers.map((s) => s.ipAddress)).size}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Unique Hosts
              </p>
            </div>
          </div>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={servers}
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
        searchPlaceholder="Search by name or IP…"
        emptyMessage="No proxy servers"
        emptyDescription="Add a RADIUS proxy server to route requests upstream."
        toolbarActions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Server
          </Button>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-brand" /> New Proxy Server
            </DialogTitle>
            <DialogDescription>Configure an upstream RADIUS server.</DialogDescription>
          </DialogHeader>
          <ServerForm isSaving={saveMutation.isPending} onSave={(v) => saveMutation.mutate(v)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-brand" /> Edit Proxy Server
            </DialogTitle>
            <DialogDescription>Update <span className="font-medium text-foreground">{editTarget?.name}</span></DialogDescription>
          </DialogHeader>
          {editTarget && (
            <ServerForm
              key={editTarget.id}
              initial={editTarget}
              isSaving={saveMutation.isPending}
              onSave={(v) => saveMutation.mutate({ ...v, id: editTarget.id })}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete proxy server?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. Realms referencing this server must be reassigned first.
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

function ServerForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: ProxyServerItem | (ProxyServerItem & { secret: string });
  isSaving: boolean;
  onSave: (values: any) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    ipAddress: initial?.ipAddress ?? "",
    authPort: (initial?.authPort ?? 1812).toString(),
    acctPort: (initial?.acctPort ?? 1813).toString(),
    secret: (initial as ProxyServerDetail)?.secret ?? "",
    type: initial?.type ?? "both",
    timeout: (initial?.timeout ?? 5).toString(),
    status: (initial?.status as "active" | "disabled") ?? "active",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          ipAddress: form.ipAddress,
          authPort: parseInt(form.authPort, 10) || 1812,
          acctPort: parseInt(form.acctPort, 10) || 1813,
          secret: form.secret || undefined,
          type: form.type,
          timeout: parseInt(form.timeout, 10) || 5,
          status: form.status,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="s-name">Name *</Label>
        <Input
          id="s-name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Upstream RADIUS 1"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="s-ip">IP Address / Host *</Label>
        <Input
          id="s-ip"
          value={form.ipAddress}
          onChange={(e) => setForm((p) => ({ ...p, ipAddress: e.target.value }))}
          placeholder="10.0.0.2"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="s-auth">Auth Port</Label>
          <Input
            id="s-auth"
            type="number"
            value={form.authPort}
            onChange={(e) => setForm((p) => ({ ...p, authPort: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-acct">Acct Port</Label>
          <Input
            id="s-acct"
            type="number"
            value={form.acctPort}
            onChange={(e) => setForm((p) => ({ ...p, acctPort: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="s-secret">Shared Secret {!initial && "*"}</Label>
        <Input
          id="s-secret"
          type="password"
          value={form.secret}
          onChange={(e) => setForm((p) => ({ ...p, secret: e.target.value }))}
          placeholder={initial ? "Leave blank to keep existing" : "Enter shared secret"}
          required={!initial}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SERVER_TYPES).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Timeout (sec)</Label>
          <Input
            type="number"
            min="1"
            max="60"
            value={form.timeout}
            onChange={(e) => setForm((p) => ({ ...p, timeout: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v: "active" | "disabled") => setForm((p) => ({ ...p, status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name || !form.ipAddress}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Server"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------
// REALMS TAB
// ---------------------------------------------------------------------

function RealmsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RealmItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RealmItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["radius-proxy-realms", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchRealms({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  // Need to fetch servers for the dropdown
  const serversQuery = useQuery({
    queryKey: ["radius-proxy-servers-for-dropdown"],
    queryFn: async () => {
      const res = await fetch("/api/v1/radius-proxy-servers?pageSize=100", { cache: "no-store" });
      const json = await res.json();
      return json.data as ProxyServerItem[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: any) => saveRealm(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radius-proxy-realms"] });
      toast.success("Realm saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRealm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radius-proxy-realms"] });
      toast.success("Realm deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<RealmItem>[]>(
    () => [
      {
        id: "realm",
        header: "Realm",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-brand shrink-0" />
            <code className="text-xs font-mono font-medium">
              {row.original.realm}
            </code>
            {row.original.stripRealm && (
              <Badge variant="outline" className="text-[10px]">strip</Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px]">
            {REALM_TYPES[row.original.type] ?? row.original.type}
          </Badge>
        ),
      },
      {
        id: "server",
        header: "Routes To",
        cell: ({ row }) => (
          row.original.server ? (
            <div className="flex items-center gap-2 text-xs">
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <div>
                <p className="font-medium">{row.original.server.name}</p>
                <code className="font-mono text-muted-foreground">
                  {row.original.server.ipAddress}
                </code>
              </div>
            </div>
          ) : (
            <span className="text-xs text-destructive">No server</span>
          )
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
              aria-label="Edit realm"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete realm"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const realms = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = realms.filter((r) => r.status === "active").length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Shuffle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Realms
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <Globe className="h-4 w-4" />
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
              <ArrowRight className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {new Set(realms.map((r) => r.serverId)).size}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Servers Used
              </p>
            </div>
          </div>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={realms}
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
        searchPlaceholder="Search by realm…"
        emptyMessage="No realms"
        emptyDescription="Create a realm to route RADIUS requests by suffix."
        toolbarActions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Realm
          </Button>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shuffle className="h-5 w-5 text-brand" /> New Realm
            </DialogTitle>
            <DialogDescription>
              Route RADIUS requests by username realm (e.g. <code>user@example.com</code>).
            </DialogDescription>
          </DialogHeader>
          <RealmForm
            isSaving={saveMutation.isPending}
            servers={serversQuery.data ?? []}
            onSave={(v) => saveMutation.mutate(v)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-brand" /> Edit Realm
            </DialogTitle>
            <DialogDescription>
              Update <code className="font-mono">{editTarget?.realm}</code>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <RealmForm
              key={editTarget.id}
              initial={editTarget}
              isSaving={saveMutation.isPending}
              servers={serversQuery.data ?? []}
              onSave={(v) => saveMutation.mutate({ ...v, id: editTarget.id })}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete realm?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete realm <code className="font-mono">{deleteTarget?.realm}</code>.
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

function RealmForm({
  initial,
  isSaving,
  servers,
  onSave,
}: {
  initial?: RealmItem;
  isSaving: boolean;
  servers: ProxyServerItem[];
  onSave: (values: any) => void;
}) {
  const [form, setForm] = useState({
    realm: initial?.realm ?? "",
    type: initial?.type ?? "auth",
    serverId: initial?.serverId ?? "",
    stripRealm: initial?.stripRealm ?? false,
    status: (initial?.status as "active" | "disabled") ?? "active",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="r-realm">Realm *</Label>
        <Input
          id="r-realm"
          value={form.realm}
          onChange={(e) => setForm((p) => ({ ...p, realm: e.target.value }))}
          placeholder="example.com"
          required
        />
        <p className="text-[10px] text-muted-foreground">
          Requests with usernames like <code>user@example.com</code> will route to the selected server.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Target Server *</Label>
        <Select
          value={form.serverId}
          onValueChange={(v) => setForm((p) => ({ ...p, serverId: v }))}
        >
          <SelectTrigger><SelectValue placeholder="Select server…" /></SelectTrigger>
          <SelectContent>
            {servers.length === 0 ? (
              <SelectItem value="_none" disabled>No servers available</SelectItem>
            ) : (
              servers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.ipAddress})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(REALM_TYPES).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v: "active" | "disabled") => setForm((p) => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <Switch
          checked={form.stripRealm}
          onCheckedChange={(c) => setForm((p) => ({ ...p, stripRealm: c }))}
        />
        <span>Strip realm from username before forwarding</span>
      </label>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.realm || !form.serverId}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Realm"}
        </Button>
      </DialogFooter>
    </form>
  );
}
