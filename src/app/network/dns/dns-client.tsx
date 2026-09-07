// =====================================================================
// DNS ZONES CLIENT — list zones, create, manage records
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Globe,
  Plus,
  Trash2,
  Edit,
  Loader2,
  Server,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DnsZoneItem {
  id: string;
  name: string;
  type: string;
  soaSerial: number;
  primaryNs: string | null;
  adminEmail: string | null;
  status: string;
  description: string | null;
  recordCount: number;
  createdAt: string;
}

interface DnsZoneDetail extends DnsZoneItem {
  soaRefresh: number;
  soaRetry: number;
  soaExpire: number;
  soaMinimum: number;
  records: Array<{
    id: string;
    name: string;
    type: string;
    value: string;
    ttl: number;
    priority: number | null;
    status: string;
  }>;
}

async function fetchZones(params: { page: number; pageSize: number; search: string }): Promise<{ data: DnsZoneItem[]; total: number }> {
  const url = new URL("/api/v1/dns-zones", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch DNS zones");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchZoneDetail(id: string): Promise<DnsZoneDetail> {
  const res = await fetch(`/api/v1/dns-zones/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch zone");
  const json = await res.json();
  return json.data;
}

async function saveZone(data: any): Promise<void> {
  const isEdit = !!data.id;
  const res = await fetch(isEdit ? `/api/v1/dns-zones/${data.id}` : "/api/v1/dns-zones", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save zone");
  }
}

async function deleteZone(id: string): Promise<void> {
  const res = await fetch(`/api/v1/dns-zones/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete zone");
  }
}

async function saveRecord(zoneId: string, action: string, record: any, recordId?: string): Promise<void> {
  const res = await fetch(`/api/v1/dns-zones/${zoneId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordAction: action, record, recordId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save record");
  }
}

const RECORD_TYPE_COLORS: Record<string, string> = {
  A: "bg-brand/10 text-brand",
  AAAA: "bg-brand/15 text-brand",
  CNAME: "bg-info/10 text-info",
  MX: "bg-success/10 text-success",
  TXT: "bg-muted text-muted-foreground",
  NS: "bg-warning/10 text-warning",
  SRV: "bg-muted text-muted-foreground",
  PTR: "bg-muted text-muted-foreground",
};

export function DnsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DnsZoneItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DnsZoneItem | null>(null);
  const [detailZone, setDetailZone] = useState<DnsZoneItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dns-zones", { page, pageSize, search }],
    queryFn: () => fetchZones({ page, pageSize, search }),
    placeholderData: (prev) => prev,
  });

  const { data: zoneDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["dns-zone-detail", detailZone?.id],
    queryFn: () => fetchZoneDetail(detailZone!.id),
    enabled: !!detailZone,
  });

  const saveMutation = useMutation({
    mutationFn: saveZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dns-zones"] });
      toast.success("Zone saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dns-zones"] });
      toast.success("Zone deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const recordMutation = useMutation({
    mutationFn: ({ zoneId, action, record, recordId }: any) => saveRecord(zoneId, action, record, recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dns-zones"] });
      queryClient.invalidateQueries({ queryKey: ["dns-zone-detail"] });
      refetchDetail();
      toast.success("Record saved");
    },
    onError: (e: Error) => toast.error("Record save failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<DnsZoneItem>[]>(
    () => [
      {
        id: "zone",
        header: "Zone Name",
        cell: ({ row }) => {
          const z = row.original;
          return (
            <button
              onClick={() => setDetailZone(z)}
              className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
            >
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", z.status === "active" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground")}>
                <Globe className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{z.name}</p>
                <Badge variant="outline" className="text-[10px] uppercase">{z.type}</Badge>
              </div>
            </button>
          );
        },
      },
      {
        id: "serial",
        header: "SOA Serial",
        cell: ({ row }) => <code className="text-xs font-mono text-muted-foreground">{row.original.soaSerial}</code>,
      },
      {
        id: "ns",
        header: "Primary NS",
        cell: ({ row }) => (
          row.original.primaryNs ? (
            <code className="text-xs font-mono">{row.original.primaryNs}</code>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        ),
      },
      {
        id: "records",
        header: "Records",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs tabular-nums">{row.original.recordCount}</Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.original)}>
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
        title="DNS Zones"
        description="Manage forward and reverse DNS zones with record management."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Zone
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
        searchPlaceholder="Search zones…"
        emptyMessage="No DNS zones"
        emptyDescription="Create your first DNS zone to manage records."
      />

      {/* Zone detail dialog */}
      <Dialog open={!!detailZone} onOpenChange={(o) => !o && setDetailZone(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-brand" />
              {detailZone?.name}
            </DialogTitle>
            <DialogDescription>
              {zoneDetail ? `SOA Serial: ${zoneDetail.soaSerial} · ${zoneDetail.records.length} records` : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          {zoneDetail && <ZoneRecords zoneId={zoneDetail.id} records={zoneDetail.records} onRecordAction={recordMutation.mutate} isPending={recordMutation.isPending} />}
        </DialogContent>
      </Dialog>

      {/* Create / Edit zone dialog */}
      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "Create DNS Zone"}</DialogTitle>
            <DialogDescription>
              {editTarget ? "Update zone configuration." : "Create a new forward or reverse DNS zone."}
            </DialogDescription>
          </DialogHeader>
          <ZoneForm zone={editTarget} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DNS zone?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span> and all its records? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete zone"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------
// ZONE RECORDS — record list + create form
// ---------------------------------------------------------------------

function ZoneRecords({
  zoneId,
  records,
  onRecordAction,
  isPending,
}: {
  zoneId: string;
  records: Array<{ id: string; name: string; type: string; value: string; ttl: number; priority: number | null; status: string }>;
  onRecordAction: (params: { zoneId: string; action: string; record: any; recordId?: string }) => void;
  isPending: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "A", value: "", ttl: 3600, priority: 10 });

  return (
    <div className="space-y-3">
      {/* Record list */}
      <div className="rounded-md border border-border max-h-60 overflow-y-auto scroll-thin">
        {records.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <FileText className="h-4 w-4" /> No records yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground bg-muted/30">
                <th className="text-left font-medium py-2 px-2">Name</th>
                <th className="text-left font-medium py-2 px-2">Type</th>
                <th className="text-left font-medium py-2 px-2">Value</th>
                <th className="text-left font-medium py-2 px-2">TTL</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1.5 px-2 text-xs font-mono">{r.name}</td>
                  <td className="py-1.5 px-2">
                    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", RECORD_TYPE_COLORS[r.type] ?? "bg-muted text-muted-foreground")}>
                      {r.type}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-xs font-mono max-w-xs truncate">{r.value}</td>
                  <td className="py-1.5 px-2 text-xs text-muted-foreground tabular-nums">{r.ttl}s</td>
                  <td className="py-1.5 px-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => onRecordAction({ zoneId, action: "delete", record: null, recordId: r.id })}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add record form */}
      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> Add Record
        </Button>
      ) : (
        <div className="rounded-md border border-border p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">New Record</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name (e.g. www or @)" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="h-8 text-xs font-mono" />
            <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "PTR"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Value (e.g. 192.168.1.1)" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} className="h-8 text-xs font-mono" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="TTL" value={form.ttl} onChange={(e) => setForm((p) => ({ ...p, ttl: Number(e.target.value) }))} className="h-8 text-xs" />
            {form.type === "MX" && (
              <Input type="number" placeholder="Priority" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))} className="h-8 text-xs" />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={isPending || !form.name || !form.value}
              onClick={() => {
                onRecordAction({ zoneId, action: "create", record: form });
                setForm({ name: "", type: "A", value: "", ttl: 3600, priority: 10 });
                setShowForm(false);
              }}
            >
              {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// ZONE FORM
// ---------------------------------------------------------------------

function ZoneForm({
  zone,
  isSaving,
  onSave,
}: {
  zone: DnsZoneItem | null;
  isSaving: boolean;
  onSave: (values: any) => void;
}) {
  const [form, setForm] = useState({
    name: zone?.name ?? "",
    type: zone?.type ?? "forward",
    primaryNs: zone?.primaryNs ?? "",
    adminEmail: zone?.adminEmail ?? "",
    description: zone?.description ?? "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...form, id: zone?.id });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="zone-name">Zone Name *</Label>
        <Input
          id="zone-name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="example.com"
          disabled={!!zone}
          required
          className="font-mono"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="zone-type">Type</Label>
        <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
          <SelectTrigger id="zone-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="forward">Forward</SelectItem>
            <SelectItem value="reverse">Reverse</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="zone-ns">Primary Nameserver</Label>
        <Input
          id="zone-ns"
          value={form.primaryNs}
          onChange={(e) => setForm((p) => ({ ...p, primaryNs: e.target.value }))}
          placeholder="ns1.example.com"
          className="font-mono"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="zone-email">Admin Email</Label>
        <Input
          id="zone-email"
          type="email"
          value={form.adminEmail}
          onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
          placeholder="admin@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="zone-desc">Description</Label>
        <Input
          id="zone-desc"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Optional zone description"
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name}>
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {zone ? "Save changes" : "Create zone"}
        </Button>
      </DialogFooter>
    </form>
  );
}
