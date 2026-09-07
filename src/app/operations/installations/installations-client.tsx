// =====================================================================
// INSTALLATIONS CLIENT — work orders list, create, assign, complete
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Hammer, Plus, CheckCircle2, Clock, Calendar, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InstItem {
  id: string; workOrderNo: string; type: string; status: string; address: string | null;
  scheduledDate: string | null; completedAt: string | null; notes: string | null;
  subscriber: { customerId: string; name: string } | null;
  technician: { id: string; name: string } | null;
  createdAt: string;
}

interface TechOption { id: string; name: string }

async function fetchInst(params: { page: number; pageSize: number; search: string; status: string }): Promise<{ data: InstItem[]; total: number }> {
  const url = new URL("/api/v1/installations", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchTechs(): Promise<TechOption[]> {
  const res = await fetch("/api/v1/technicians?pageSize=100", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data.map((t: any) => ({ id: t.id, name: t.name }));
}

const TYPE_LABELS: Record<string, string> = { new_install: "New Install", upgrade: "Upgrade", repair: "Repair", disconnect: "Disconnect", relocation: "Relocation" };
const TYPE_COLORS: Record<string, string> = { new_install: "bg-brand/10 text-brand", upgrade: "bg-info/10 text-info", repair: "bg-warning/10 text-warning", disconnect: "bg-destructive/10 text-destructive", relocation: "bg-muted text-muted-foreground" };

export function InstallationsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<InstItem | null>(null);
  const [notes, setNotes] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["installations", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchInst({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const { data: techs } = useQuery({ queryKey: ["techs-options"], queryFn: fetchTechs });

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await fetch("/api/v1/installations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["installations"] }); toast.success("Work order created"); setCreateOpen(false); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const completeMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const res = await fetch(`/api/v1/installations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed", notes }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["installations"] }); toast.success("Marked completed"); setCompleteTarget(null); setNotes(""); },
    onError: () => toast.error("Failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<InstItem>[]>(() => [
    { id: "wo", header: "Work Order", cell: ({ row }) => <code className="text-xs font-mono text-brand">{row.original.workOrderNo}</code> },
    { id: "type", header: "Type", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", TYPE_COLORS[row.original.type] ?? "bg-muted")}>{TYPE_LABELS[row.original.type] ?? row.original.type}</span> },
    { id: "subscriber", header: "Subscriber", cell: ({ row }) => row.original.subscriber ? <div className="text-xs"><p className="font-medium">{row.original.subscriber.name}</p><code className="text-muted-foreground font-mono">{row.original.subscriber.customerId}</code></div> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "address", header: "Address", cell: ({ row }) => row.original.address ? <span className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{row.original.address}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "technician", header: "Technician", cell: ({ row }) => row.original.technician ? <span className="text-xs">{row.original.technician.name}</span> : <span className="text-xs text-muted-foreground">Unassigned</span> },
    { id: "scheduled", header: "Scheduled", cell: ({ row }) => row.original.scheduledDate ? <span className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3 text-muted-foreground" />{format(new Date(row.original.scheduledDate), "MMM d, yyyy")}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} label={row.original.status.replace(/_/g, " ")} /> },
    { id: "actions", header: "", cell: ({ row }) => ["scheduled", "in_progress"].includes(row.original.status) ? <Button variant="ghost" size="sm" className="h-8 text-success hover:text-success" onClick={() => setCompleteTarget(row.original)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete</Button> : null },
  ], []);

  return (
    <>
      <PageHeader title="Installations" description="Work orders for new installs, upgrades, repairs, and disconnections." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Work Order</Button>} />
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Hammer className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><Clock className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((i) => ["scheduled", "in_progress"].includes(i.status)).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((i) => i.status === "completed").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Completed</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground"><Calendar className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((i) => i.scheduledDate && new Date(i.scheduledDate) > new Date()).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Upcoming</p></div></div></Card>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search by work order #, address, or customer…" emptyMessage="No work orders" emptyDescription="Create a work order to schedule an installation." />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Hammer className="h-5 w-5 text-brand" /> New Work Order</DialogTitle><DialogDescription>Schedule a new installation or service visit.</DialogDescription></DialogHeader>
          <InstForm techs={techs ?? []} isSaving={createMutation.isPending} onSave={(values) => createMutation.mutate(values)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!completeTarget} onOpenChange={(o) => { if (!o) { setCompleteTarget(null); setNotes(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> Complete Work Order</DialogTitle><DialogDescription>Mark {completeTarget?.workOrderNo} as completed.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="notes">Completion Notes</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done? Any issues?" rows={3} /></div>
          <DialogFooter><Button variant="outline" onClick={() => { setCompleteTarget(null); setNotes(""); }}>Cancel</Button><Button disabled={completeMutation.isPending} onClick={() => completeTarget && completeMutation.mutate({ id: completeTarget.id, notes })}>{completeMutation.isPending ? "Saving…" : "Complete"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InstForm({ techs, isSaving, onSave }: { techs: TechOption[]; isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({ type: "new_install", subscriberId: "", technicianId: "", address: "", scheduledDate: "", notes: "" });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, subscriberId: form.subscriberId || undefined, technicianId: form.technicianId || undefined, scheduledDate: form.scheduledDate ? new Date(form.scheduledDate).toISOString() : undefined }); }} className="space-y-4">
      <div className="space-y-2"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="i-sub">Subscriber ID</Label><Input id="i-sub" value={form.subscriberId} onChange={(e) => setForm((p) => ({ ...p, subscriberId: e.target.value }))} placeholder="Optional" /></div>
        <div className="space-y-2"><Label>Technician</Label><Select value={form.technicianId} onValueChange={(v) => setForm((p) => ({ ...p, technicianId: v }))}><SelectTrigger><SelectValue placeholder="Assign to…" /></SelectTrigger><SelectContent>{techs.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="space-y-2"><Label htmlFor="i-addr">Address</Label><Input id="i-addr" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Installation address" /></div>
      <div className="space-y-2"><Label htmlFor="i-sched">Scheduled Date</Label><Input id="i-sched" type="datetime-local" value={form.scheduledDate} onChange={(e) => setForm((p) => ({ ...p, scheduledDate: e.target.value }))} /></div>
      <div className="space-y-2"><Label htmlFor="i-notes">Notes</Label><Textarea id="i-notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
      <DialogFooter><Button type="submit" disabled={isSaving}>{isSaving ? "Creating…" : "Create Work Order"}</Button></DialogFooter>
    </form>
  );
}
