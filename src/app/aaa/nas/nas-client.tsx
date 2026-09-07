// =====================================================================
// NAS CLIENTS CLIENT — list, create, edit, delete NAS devices
// Shows RADIUS clients (routers/BRAS) with shared secret, CoA port, status
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatDistanceToNow } from "date-fns";
import {
  Server,
  Plus,
  Edit,
  Trash2,
  KeyRound,
  Wifi,
  Activity,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NasItem {
  id: string;
  name: string;
  ipAddress: string;
  type: string;
  coaPort: number;
  status: string;
  lastSeenAt: string | null;
  activeSessionCount: number;
  hasSecret: boolean;
  createdAt: string;
}

interface NasDetail extends NasItem {
  sharedSecret: string;
  totalSessionCount: number;
}

async function fetchNas(params: { page: number; pageSize: number; search: string }): Promise<{ data: NasItem[]; total: number }> {
  const url = new URL("/api/v1/nas", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch NAS");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveNas(data: any): Promise<void> {
  const isEdit = !!data.id;
  const res = await fetch(isEdit ? `/api/v1/nas/${data.id}` : "/api/v1/nas", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save NAS");
  }
}

async function deleteNas(id: string): Promise<void> {
  const res = await fetch(`/api/v1/nas/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete NAS");
  }
}

const TYPE_LABELS: Record<string, string> = {
  mikrotik: "MikroTik",
  cisco: "Cisco",
  juniper: "Juniper",
  generic: "Generic",
  other: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  mikrotik: "bg-brand/10 text-brand",
  cisco: "bg-info/10 text-info",
  juniper: "bg-success/10 text-success",
  generic: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
};

export function NasClientPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<NasItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NasItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["nas", { page, pageSize, search }],
    queryFn: () => fetchNas({ page, pageSize, search }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: saveNas,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nas"] });
      toast.success("NAS saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNas,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nas"] });
      toast.success("NAS deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<NasItem>[]>(
    () => [
      {
        id: "name",
        header: "NAS Device",
        cell: ({ row }) => {
          const n = row.original;
          return (
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  n.status === "active" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
                )}
              >
                <Server className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{n.name}</p>
                <code className="text-xs text-muted-foreground font-mono">{n.ipAddress}</code>
              </div>
            </div>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
              TYPE_COLORS[row.original.type] ?? TYPE_COLORS.generic
            )}
          >
            {TYPE_LABELS[row.original.type] ?? row.original.type}
          </span>
        ),
      },
      {
        id: "coaPort",
        header: "CoA Port",
        cell: ({ row }) => (
          <code className="text-xs font-mono text-muted-foreground">UDP {row.original.coaPort}</code>
        ),
      },
      {
        id: "sessions",
        header: "Sessions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-sm">
            {row.original.activeSessionCount > 0 ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="text-success font-medium">{row.original.activeSessionCount} active</span>
              </>
            ) : (
              <span className="text-muted-foreground">0 active</span>
            )}
          </div>
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
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditTarget(row.original)}
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              disabled={row.original.activeSessionCount > 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
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
        title="NAS Clients"
        description="Network Access Servers — RADIUS clients that send Access-Request and Accounting packets."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> Add NAS
          </Button>
        }
      />

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
        searchPlaceholder="Search by name, IP, or type…"
        emptyMessage="No NAS clients"
        emptyDescription="Add your first NAS to start receiving RADIUS packets."
      />

      {/* Create / Edit dialog */}
      <Dialog
        open={createOpen || !!editTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit NAS: ${editTarget.name}` : "Add NAS Client"}</DialogTitle>
            <DialogDescription>
              Configure a RADIUS client. The shared secret must match the NAS configuration.
            </DialogDescription>
          </DialogHeader>
          <NasForm
            nas={editTarget}
            isSaving={saveMutation.isPending}
            onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete NAS?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span> ({deleteTarget?.ipAddress})?
              This will prevent the NAS from authenticating. Active sessions must be disconnected first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete NAS"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// NasForm will be loaded from a separate file to keep this manageable
export { NasClientPage as NasClient };

// ---------------------------------------------------------------------
// NAS FORM
// ---------------------------------------------------------------------

function NasForm({
  nas,
  isSaving,
  onSave,
}: {
  nas: NasItem | null;
  isSaving: boolean;
  onSave: (values: any) => void;
}) {
  const [form, setForm] = useState({
    name: nas?.name ?? "",
    ipAddress: nas?.ipAddress ?? "",
    sharedSecret: "",
    type: nas?.type ?? "generic",
    coaPort: nas?.coaPort ?? 3799,
    status: nas?.status ?? "active",
  });

  const handleChange = (key: string, value: any) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...form,
          coaPort: Number(form.coaPort),
          // Don't send empty sharedSecret on edit (keep existing)
          sharedSecret: form.sharedSecret || undefined,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="nas-name">Name</Label>
        <Input
          id="nas-name"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="e.g. MikroTik Router 1"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="nas-ip">IP Address</Label>
          <Input
            id="nas-ip"
            value={form.ipAddress}
            onChange={(e) => handleChange("ipAddress", e.target.value)}
            placeholder="10.0.0.1"
            disabled={!!nas}
            required
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nas-coa">CoA Port</Label>
          <Input
            id="nas-coa"
            type="number"
            min="1"
            max="65535"
            value={form.coaPort}
            onChange={(e) => handleChange("coaPort", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nas-type">Type</Label>
        <Select value={form.type} onValueChange={(v) => handleChange("type", v)}>
          <SelectTrigger id="nas-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nas-secret">
          Shared Secret {nas && <span className="text-xs text-muted-foreground">(blank = keep current)</span>}
        </Label>
        <div className="relative">
          <KeyRound className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="nas-secret"
            type="password"
            value={form.sharedSecret}
            onChange={(e) => handleChange("sharedSecret", e.target.value)}
            placeholder={nas ? "••••••••" : "Enter shared secret"}
            className="pl-8 font-mono"
            required={!nas}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Must match the RADIUS client configuration on the NAS.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nas-status">Status</Label>
        <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
          <SelectTrigger id="nas-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name || !form.ipAddress}>
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {nas ? "Save changes" : "Add NAS"}
        </Button>
      </DialogFooter>
    </form>
  );
}
