// =====================================================================
// API KEYS CLIENT — generate, copy, revoke
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
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  KeyRound,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  Ban,
  ShieldAlert,
  Activity,
  Clock,
} from "lucide-react";

interface ApiKeyItem {
  id: string;
  name: string;
  keyMasked: string;
  permissions: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
}

interface NewKeyResponse {
  id: string;
  name: string;
  key: string;
  permissions: string | null;
  expiresAt: string | null;
  status: string;
  message: string;
}

async function fetchApiKeys(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: ApiKeyItem[]; total: number }> {
  const url = new URL("/api/v1/api-keys", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch API keys");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function createApiKey(data: {
  name: string;
  permissions?: string[];
  expiresAt?: string;
}): Promise<NewKeyResponse> {
  const res = await fetch("/api/v1/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to create API key");
  }
  const json = await res.json();
  return json.data;
}

async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to revoke API key");
  }
}

export function ApiKeysClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<NewKeyResponse | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["api-keys", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchApiKeys({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setCreateOpen(false);
      setNewKey(resp);
      toast.success("API key created");
    },
    onError: (e: Error) => toast.error("Failed to create key", { description: e.message }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
      setRevokeTarget(null);
    },
    onError: (e: Error) => toast.error("Revoke failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API key copied", { description: "Store securely — you can't see it again." });
  };

  const columns = useMemo<ColumnDef<ApiKeyItem>[]>(
    () => [
      {
        id: "name",
        header: "Key",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <p className="text-sm font-medium truncate">{row.original.name}</p>
            <p className="text-[11px] text-muted-foreground font-mono">
              {row.original.keyMasked}
            </p>
          </div>
        ),
      },
      {
        id: "permissions",
        header: "Permissions",
        cell: ({ row }) => {
          if (!row.original.permissions) {
            return (
              <Badge variant="outline" className="text-[11px]">
                All
              </Badge>
            );
          }
          try {
            const perms = JSON.parse(row.original.permissions) as string[];
            if (!perms.length) {
              return (
                <Badge variant="outline" className="text-[11px]">
                  All
                </Badge>
              );
            }
            return (
              <div className="flex flex-wrap gap-1 max-w-48">
                {perms.slice(0, 3).map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px] font-mono">
                    {p}
                  </Badge>
                ))}
                {perms.length > 3 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{perms.length - 3} more
                  </Badge>
                )}
              </div>
            );
          } catch {
            return (
              <Badge variant="outline" className="text-[11px]">
                Custom
              </Badge>
            );
          }
        },
      },
      {
        id: "lastUsed",
        header: "Last Used",
        cell: ({ row }) =>
          row.original.lastUsedAt ? (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(row.original.lastUsedAt), { addSuffix: true })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Never</span>
          ),
      },
      {
        id: "expiresAt",
        header: "Expires",
        cell: ({ row }) => {
          if (!row.original.expiresAt) {
            return <span className="text-xs text-muted-foreground">Never</span>;
          }
          const date = new Date(row.original.expiresAt);
          const expired = isPast(date);
          return (
            <div className="flex flex-col">
              <span className="text-xs">{format(date, "MMM d, yyyy")}</span>
              <span
                className={`text-[10px] ${expired ? "text-destructive" : "text-muted-foreground"}`}
              >
                {expired ? "Expired" : formatDistanceToNow(date, { addSuffix: true })}
              </span>
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
        id: "createdBy",
        header: "Created By",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {row.original.createdBy ?? "system"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.status === "active" ? (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-destructive"
                onClick={() => setRevokeTarget(row.original)}
                aria-label="Revoke API key"
              >
                <Ban className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null,
      },
    ],
    []
  );

  const keys = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = keys.filter((k) => k.status === "active").length;
  const revokedCount = keys.filter((k) => k.status === "revoked").length;
  const neverUsed = keys.filter((k) => !k.lastUsedAt && k.status === "active").length;

  return (
    <>
      <PageHeader
        title="API Keys"
        description="Manage API keys for programmatic access to Cryptsk. Keys are shown ONCE on creation — store them securely."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New API Key
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Keys
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
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{neverUsed}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Never Used
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Ban className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{revokedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Revoked
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
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={keys}
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
        searchPlaceholder="Search by name or creator…"
        emptyMessage="No API keys"
        emptyDescription="Create an API key to enable programmatic access."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-brand" /> New API Key
            </DialogTitle>
            <DialogDescription>
              The plaintext key will only be shown once after creation.
            </DialogDescription>
          </DialogHeader>
          <CreateKeyForm
            isSaving={createMutation.isPending}
            onSave={(values) => createMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      {/* New key dialog */}
      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-warning" /> Save Your API Key
            </DialogTitle>
            <DialogDescription>
              This is the only time you can copy this key. Store it securely.
            </DialogDescription>
          </DialogHeader>
          {newKey && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium">{newKey.name}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-key">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-key"
                    readOnly
                    value={newKey.key}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => handleCopyKey(newKey.key)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {newKey.expiresAt
                  ? `Expires ${format(new Date(newKey.expiresAt), "MMM d, yyyy")}`
                  : "No expiry set — rotate regularly"}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(o) => {
          if (!o) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke <strong>{revokeTarget?.name}</strong>. Any
              integration using this key will stop working immediately. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------
// CREATE KEY FORM
// ---------------------------------------------------------------------

function CreateKeyForm({
  isSaving,
  onSave,
}: {
  isSaving: boolean;
  onSave: (values: { name: string; permissions?: string[]; expiresAt?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState("");
  const [expiryDays, setExpiryDays] = useState("0");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const permList = permissions
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const days = parseInt(expiryDays, 10);
    const expiresAt =
      days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
    onSave({
      name,
      permissions: permList.length ? permList : undefined,
      expiresAt,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="k-name">Name *</Label>
        <Input
          id="k-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Billing Integration"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="k-perms">
          Permissions (comma-separated, blank = all)
        </Label>
        <Input
          id="k-perms"
          value={permissions}
          onChange={(e) => setPermissions(e.target.value)}
          placeholder="billing.invoice.read, billing.voucher.read"
          className="font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Leave blank for full access. Use module-scoped permission keys.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Expiry</Label>
        <Select value={expiryDays} onValueChange={setExpiryDays}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Never</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
            <SelectItem value="180">180 days</SelectItem>
            <SelectItem value="365">1 year</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !name}>
          {isSaving ? "Creating…" : "Generate Key"}
        </Button>
      </DialogFooter>
    </form>
  );
}
