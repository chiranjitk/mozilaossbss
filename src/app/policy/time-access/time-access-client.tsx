// =====================================================================
// TIME ACCESS CLIENT — schedule-based access control profiles
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
import { Clock, Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeProfile {
  id: string; name: string; description: string | null;
  schedule: Record<string, any> | null; timezone: string; action: string;
  status: string; createdAt: string;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

const formatSchedule = (schedule: Record<string, any> | null): string => {
  if (!schedule) return "—";
  const entries = DAYS.filter((d) => schedule[d]?.length > 0);
  if (entries.length === 0) return "—";
  if (entries.length === 7) {
    const times = schedule[entries[0]]?.map((t: any) => `${t.start}-${t.end}`).join(", ");
    return `Every day: ${times}`;
  }
  return entries.map((d) => `${DAY_LABELS[d].slice(0, 3)}: ${schedule[d].map((t: any) => `${t.start}-${t.end}`).join(", ")}`).join("; ");
};

export function TimeAccessClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TimeProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TimeProfile | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["time-access", { page, pageSize, search, statusFilter }],
    queryFn: async () => {
      const url = new URL("/api/v1/time-access", window.location.origin);
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
      const res = await fetch(isEdit ? `/api/v1/time-access/${values.id}` : "/api/v1/time-access", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["time-access"] }); toast.success("Saved"); setCreateOpen(false); setEditTarget(null); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/time-access/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["time-access"] }); toast.success("Deleted"); setDeleteTarget(null); },
    onError: () => toast.error("Delete failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<TimeProfile>[]>(() => [
    { id: "name", header: "Profile", cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.name}</p>{row.original.description && <p className="text-xs text-muted-foreground line-clamp-1">{row.original.description}</p>}</div> },
    { id: "schedule", header: "Schedule", cell: ({ row }) => <span className="text-xs">{formatSchedule(row.original.schedule)}</span> },
    { id: "timezone", header: "Timezone", cell: ({ row }) => <code className="text-xs font-mono text-muted-foreground">{row.original.timezone}</code> },
    { id: "action", header: "Outside Schedule", cell: ({ row }) => <Badge variant="outline" className={cn("text-[10px] capitalize", row.original.action === "deny" ? "text-destructive border-destructive/30" : "text-success border-success/30")}>{row.original.action}</Badge> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "", cell: ({ row }) => <div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button></div> },
  ], []);

  return (
    <>
      <PageHeader title="Time Access" description="Schedule-based access control profiles. Restrict subscriber access to specific time windows." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Profile</Button>} />
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Clock className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><Clock className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((p) => p.status === "active").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive"><Clock className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((p) => p.action === "deny").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deny Outside</p></div></div></Card>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search profiles…" emptyMessage="No time access profiles" emptyDescription="Create a profile to schedule subscriber access windows." />
      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "New Time Access Profile"}</DialogTitle><DialogDescription>Define access schedule per day.</DialogDescription></DialogHeader>
          <TimeAccessForm profile={editTarget} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete profile?</AlertDialogTitle><AlertDialogDescription>Delete {deleteTarget?.name}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TimeAccessForm({ profile, isSaving, onSave }: { profile: TimeProfile | null; isSaving: boolean; onSave: (values: any) => void }) {
  // Initialize schedule from profile or default (24/7 access)
  const initialSchedule = profile?.schedule ?? DAYS.reduce((acc, d) => { acc[d] = [{ start: "00:00", end: "23:59" }]; return acc; }, {} as Record<string, any[]>);
  const [form, setForm] = useState({
    name: profile?.name ?? "", description: profile?.description ?? "",
    schedule: initialSchedule, timezone: profile?.timezone ?? "UTC",
    action: profile?.action ?? "allow", status: profile?.status ?? "active",
  });

  const toggleDay = (day: string) => {
    setForm((p) => {
      const schedule = { ...p.schedule };
      if (schedule[day]?.length > 0) {
        schedule[day] = []; // disable day
      } else {
        schedule[day] = [{ start: "08:00", end: "22:00" }]; // default hours
      }
      return { ...p, schedule };
    });
  };

  const updateTime = (day: string, index: number, field: "start" | "end", value: string) => {
    setForm((p) => {
      const schedule = { ...p.schedule };
      schedule[day] = [...(schedule[day] || [])];
      schedule[day][index] = { ...schedule[day][index], [field]: value };
      return { ...p, schedule };
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({
      name: form.name, description: form.description || undefined,
      schedule: form.schedule, timezone: form.timezone, action: form.action, status: form.status,
    }); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="ta-name">Name *</Label><Input id="ta-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      <div className="space-y-2"><Label htmlFor="ta-desc">Description</Label><Textarea id="ta-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} /></div>
      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule</p>
        {DAYS.map((day) => {
          const isEnabled = form.schedule[day]?.length > 0;
          return (
            <div key={day} className="flex items-center gap-3">
              <label className="flex items-center gap-2 w-28 cursor-pointer">
                <Switch checked={isEnabled} onCheckedChange={() => toggleDay(day)} />
                <span className="text-sm">{DAY_LABELS[day]}</span>
              </label>
              {isEnabled && form.schedule[day].map((slot: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="time" value={slot.start} onChange={(e) => updateTime(day, i, "start", e.target.value)} className="h-8 w-28 text-xs" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="time" value={slot.end} onChange={(e) => updateTime(day, i, "end", e.target.value)} className="h-8 w-28 text-xs" />
                </div>
              ))}
              {!isEnabled && <span className="text-xs text-muted-foreground">No access</span>}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2"><Label>Timezone</Label><Input value={form.timezone} onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))} placeholder="UTC" /></div>
        <div className="space-y-2"><Label>Outside Schedule</Label><Select value={form.action} onValueChange={(v) => setForm((p) => ({ ...p, action: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="allow">Allow</SelectItem><SelectItem value="deny">Deny</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select></div>
      </div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name}>{isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{profile ? "Save Changes" : "Create Profile"}</Button></DialogFooter>
    </form>
  );
}
