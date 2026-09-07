// =====================================================================
// BANDWIDTH PROFILES CLIENT — list, create, edit, delete
// Shows speed/burst/priority with visual speed indicators
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Gauge, Plus, Edit, Trash2, TrendingDown, TrendingUp, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Profile {
  id: string; name: string; description: string | null;
  downloadSpeed: number; uploadSpeed: number;
  downloadBurst: number | null; uploadBurst: number | null;
  burstThreshold: number | null; burstTime: number | null;
  priority: number; status: string; assignedCount: number;
  createdAt: string;
}

async function fetchProfiles(params: { page: number; pageSize: number; search: string; status: string }): Promise<{ data: Profile[]; total: number }> {
  const url = new URL("/api/v1/bandwidth-profiles", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const formatSpeed = (kbps: number): string => {
  if (kbps >= 1000000) return `${(kbps / 1000000).toFixed(1)} Gbps`;
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`;
  return `${kbps} Kbps`;
};

const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-destructive/10 text-destructive", 2: "bg-destructive/10 text-destructive",
  3: "bg-warning/10 text-warning", 4: "bg-warning/10 text-warning",
  5: "bg-info/10 text-info", 6: "bg-info/10 text-info",
  7: "bg-muted text-muted-foreground", 8: "bg-muted text-muted-foreground",
};

export function BandwidthProfilesClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["bandwidth-profiles", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchProfiles({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const isEdit = !!values.id;
      const res = await fetch(isEdit ? `/api/v1/bandwidth-profiles/${values.id}` : "/api/v1/bandwidth-profiles", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bandwidth-profiles"] }); toast.success("Saved"); setCreateOpen(false); setEditTarget(null); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/bandwidth-profiles/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bandwidth-profiles"] }); toast.success("Deleted"); setDeleteTarget(null); },
    onError: () => toast.error("Delete failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<Profile>[]>(() => [
    { id: "name", header: "Profile", cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.name}</p>{row.original.description && <p className="text-xs text-muted-foreground line-clamp-1">{row.original.description}</p>}</div> },
    { id: "download", header: "Download", cell: ({ row }) => <span className="flex items-center gap-1.5 text-sm"><TrendingDown className="h-3.5 w-3.5 text-brand" />{formatSpeed(row.original.downloadSpeed)}</span> },
    { id: "upload", header: "Upload", cell: ({ row }) => <span className="flex items-center gap-1.5 text-sm"><TrendingUp className="h-3.5 w-3.5 text-success" />{formatSpeed(row.original.uploadSpeed)}</span> },
    { id: "burst", header: "Burst", cell: ({ row }) => (row.original.downloadBurst || row.original.uploadBurst) ? <div className="text-xs"><p>↓ {row.original.downloadBurst ? formatSpeed(row.original.downloadBurst) : "—"}</p><p>↑ {row.original.uploadBurst ? formatSpeed(row.original.uploadBurst) : "—"}</p></div> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "priority", header: "Priority", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", PRIORITY_COLORS[row.original.priority] ?? "bg-muted")}>P{row.original.priority}</span> },
    { id: "assigned", header: "Assigned", cell: ({ row }) => <Badge variant="outline" className="text-xs tabular-nums">{row.original.assignedCount}</Badge> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "", cell: ({ row }) => <div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button></div> },
  ], []);

  return (
    <>
      <PageHeader title="Bandwidth Profiles" description="Manage bandwidth limits, burst settings, and priorities. These profiles are pushed to NAS via RADIUS attributes." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Profile</Button>} />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Gauge className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><Gauge className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((p) => p.status === "active").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><Zap className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((p) => p.downloadBurst || p.uploadBurst).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">With Burst</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info"><Gauge className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.reduce((s, p) => s + p.assignedCount, 0)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assignments</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search profiles…" emptyMessage="No bandwidth profiles" emptyDescription="Create a bandwidth profile to set speed limits." />

      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader><DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "New Bandwidth Profile"}</DialogTitle><DialogDescription>{editTarget ? "Update speed and burst settings." : "Define download/upload speeds, burst limits, and priority."}</DialogDescription></DialogHeader>
          <BandwidthForm profile={editTarget} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete profile?</AlertDialogTitle><AlertDialogDescription>Delete {deleteTarget?.name}? This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BandwidthForm({ profile, isSaving, onSave }: { profile: Profile | null; isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    name: profile?.name ?? "", description: profile?.description ?? "",
    downloadSpeed: String(profile?.downloadSpeed ?? "51200"), uploadSpeed: String(profile?.uploadSpeed ?? "10240"),
    downloadBurst: profile?.downloadBurst ? String(profile.downloadBurst) : "",
    uploadBurst: profile?.uploadBurst ? String(profile.uploadBurst) : "",
    burstThreshold: profile?.burstThreshold ? String(profile.burstThreshold) : "",
    burstTime: profile?.burstTime ? String(profile.burstTime) : "",
    priority: String(profile?.priority ?? "8"), status: profile?.status ?? "active",
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({
      name: form.name, description: form.description || undefined,
      downloadSpeed: Number(form.downloadSpeed), uploadSpeed: Number(form.uploadSpeed),
      downloadBurst: form.downloadBurst ? Number(form.downloadBurst) : undefined,
      uploadBurst: form.uploadBurst ? Number(form.uploadBurst) : undefined,
      burstThreshold: form.burstThreshold ? Number(form.burstThreshold) : undefined,
      burstTime: form.burstTime ? Number(form.burstTime) : undefined,
      priority: Number(form.priority), status: form.status,
    }); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="bp-name">Name *</Label><Input id="bp-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required placeholder="e.g. 50 Mbps Down / 10 Up" /></div>
      <div className="space-y-2"><Label htmlFor="bp-desc">Description</Label><Textarea id="bp-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="bp-down">Download Speed (Kbps)</Label><Input id="bp-down" type="number" min="0" value={form.downloadSpeed} onChange={(e) => setForm((p) => ({ ...p, downloadSpeed: e.target.value }))} required /><p className="text-[10px] text-muted-foreground">{Number(form.downloadSpeed) >= 1000 ? `${(Number(form.downloadSpeed) / 1000).toFixed(0)} Mbps` : `${form.downloadSpeed} Kbps`}</p></div>
        <div className="space-y-2"><Label htmlFor="bp-up">Upload Speed (Kbps)</Label><Input id="bp-up" type="number" min="0" value={form.uploadSpeed} onChange={(e) => setForm((p) => ({ ...p, uploadSpeed: e.target.value }))} required /><p className="text-[10px] text-muted-foreground">{Number(form.uploadSpeed) >= 1000 ? `${(Number(form.uploadSpeed) / 1000).toFixed(0)} Mbps` : `${form.uploadSpeed} Kbps`}</p></div>
      </div>
      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Burst Settings (Optional)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="bp-dburst" className="text-xs">Download Burst (Kbps)</Label><Input id="bp-dburst" type="number" min="0" value={form.downloadBurst} onChange={(e) => setForm((p) => ({ ...p, downloadBurst: e.target.value }))} placeholder="0 = no burst" /></div>
          <div className="space-y-2"><Label htmlFor="bp-uburst" className="text-xs">Upload Burst (Kbps)</Label><Input id="bp-uburst" type="number" min="0" value={form.uploadBurst} onChange={(e) => setForm((p) => ({ ...p, uploadBurst: e.target.value }))} placeholder="0 = no burst" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="bp-threshold" className="text-xs">Burst Threshold (Kbps)</Label><Input id="bp-threshold" type="number" min="0" value={form.burstThreshold} onChange={(e) => setForm((p) => ({ ...p, burstThreshold: e.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="bp-time" className="text-xs">Burst Time (seconds)</Label><Input id="bp-time" type="number" min="0" value={form.burstTime} onChange={(e) => setForm((p) => ({ ...p, burstTime: e.target.value }))} /></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4,5,6,7,8].map((n) => <SelectItem key={n} value={String(n)}>P{n} {n <= 2 ? "(Highest)" : n >= 7 ? "(Lowest)" : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select></div>
      </div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name}>{isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{profile ? "Save Changes" : "Create Profile"}</Button></DialogFooter>
    </form>
  );
}
