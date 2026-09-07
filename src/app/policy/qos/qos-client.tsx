// =====================================================================
// QOS QUEUES CLIENT — list, create, edit, delete
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Layers, Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface QosItem {
  id: string; name: string; description: string | null; type: string;
  priority: number; rateLimit: number | null; ceilLimit: number | null;
  quantum: number | null; status: string; createdAt: string;
}

const TYPE_LABELS: Record<string, string> = { pfifo: "PFIFO", bfifo: "BFIFO", codel: "CoDel", fq_codel: "FQ-CoDel", priority: "Priority" };
const TYPE_COLORS: Record<string, string> = { pfifo: "bg-muted text-muted-foreground", bfifo: "bg-muted text-muted-foreground", codel: "bg-brand/10 text-brand", fq_codel: "bg-success/10 text-success", priority: "bg-warning/10 text-warning" };
const PRIORITY_COLORS: Record<number, string> = { 1: "bg-destructive/10 text-destructive", 2: "bg-destructive/10 text-destructive", 3: "bg-warning/10 text-warning", 4: "bg-warning/10 text-warning", 5: "bg-info/10 text-info", 6: "bg-info/10 text-info", 7: "bg-muted text-muted-foreground", 8: "bg-muted text-muted-foreground" };

const formatKbps = (kbps: number | null) => { if (!kbps) return "—"; return kbps >= 1000 ? `${(kbps / 1000).toFixed(0)} Mbps` : `${kbps} Kbps`; };

export function QosClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QosItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QosItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qos-queues", { page, pageSize, search, statusFilter }],
    queryFn: async () => {
      const url = new URL("/api/v1/qos-queues", window.location.origin);
      url.searchParams.set("page", String(page)); url.searchParams.set("pageSize", String(pageSize));
      if (search) url.searchParams.set("search", search);
      if (statusFilter !== "all") url.searchParams.set("status", statusFilter);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const json = await res.json(); return { data: json.data, total: json.meta.total };
    },
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const isEdit = !!values.id;
      const res = await fetch(isEdit ? `/api/v1/qos-queues/${values.id}` : "/api/v1/qos-queues", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["qos-queues"] }); toast.success("Saved"); setCreateOpen(false); setEditTarget(null); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/qos-queues/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["qos-queues"] }); toast.success("Deleted"); setDeleteTarget(null); },
    onError: () => toast.error("Delete failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<QosItem>[]>(() => [
    { id: "name", header: "Queue", cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.name}</p>{row.original.description && <p className="text-xs text-muted-foreground line-clamp-1">{row.original.description}</p>}</div> },
    { id: "type", header: "Type", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", TYPE_COLORS[row.original.type] ?? "bg-muted")}>{TYPE_LABELS[row.original.type] ?? row.original.type}</span> },
    { id: "priority", header: "Priority", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", PRIORITY_COLORS[row.original.priority] ?? "bg-muted")}>P{row.original.priority}</span> },
    { id: "rate", header: "Rate Limit", cell: ({ row }) => <span className="text-sm tabular-nums">{formatKbps(row.original.rateLimit)}</span> },
    { id: "ceil", header: "Ceiling", cell: ({ row }) => <span className="text-sm tabular-nums">{formatKbps(row.original.ceilLimit)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "", cell: ({ row }) => <div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button></div> },
  ], []);

  return (
    <>
      <PageHeader title="QoS Queues" description="Manage Quality of Service queues for traffic shaping and prioritization." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Queue</Button>} />
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Layers className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Queues</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><Layers className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((q) => q.status === "active").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><Layers className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((q) => q.rateLimit).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rate-Limited</p></div></div></Card>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search queues…" emptyMessage="No QoS queues" emptyDescription="Create a queue to manage traffic shaping." />
      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "New QoS Queue"}</DialogTitle><DialogDescription>Configure traffic queue type and rate limits.</DialogDescription></DialogHeader>
          <QosForm queue={editTarget} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete queue?</AlertDialogTitle><AlertDialogDescription>Delete {deleteTarget?.name}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QosForm({ queue, isSaving, onSave }: { queue: QosItem | null; isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    name: queue?.name ?? "", description: queue?.description ?? "", type: queue?.type ?? "pfifo",
    priority: String(queue?.priority ?? "8"), rateLimit: queue?.rateLimit ? String(queue.rateLimit) : "",
    ceilLimit: queue?.ceilLimit ? String(queue.ceilLimit) : "", status: queue?.status ?? "active",
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({
      name: form.name, description: form.description || undefined, type: form.type,
      priority: Number(form.priority), rateLimit: form.rateLimit ? Number(form.rateLimit) : undefined,
      ceilLimit: form.ceilLimit ? Number(form.ceilLimit) : undefined, status: form.status,
    }); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="q-name">Name *</Label><Input id="q-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      <div className="space-y-2"><Label htmlFor="q-desc">Description</Label><Textarea id="q-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5,6,7,8].map((n) => <SelectItem key={n} value={String(n)}>P{n}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="q-rate">Rate Limit (Kbps)</Label><Input id="q-rate" type="number" min="0" value={form.rateLimit} onChange={(e) => setForm((p) => ({ ...p, rateLimit: e.target.value }))} placeholder="0 = unlimited" /></div>
        <div className="space-y-2"><Label htmlFor="q-ceil">Ceiling (Kbps)</Label><Input id="q-ceil" type="number" min="0" value={form.ceilLimit} onChange={(e) => setForm((p) => ({ ...p, ceilLimit: e.target.value }))} placeholder="0 = no ceiling" /></div>
      </div>
      <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select></div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name}>{isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{queue ? "Save Changes" : "Create Queue"}</Button></DialogFooter>
    </form>
  );
}
