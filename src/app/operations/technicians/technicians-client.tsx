// =====================================================================
// TECHNICIANS CLIENT — list, create, edit, delete
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { HardHat, Plus, Edit, Trash2, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface TechItem {
  id: string; name: string; phone: string | null; email: string | null;
  employeeId: string | null; status: string; activeAssignments: number; createdAt: string;
}

async function fetchTechs(params: { page: number; pageSize: number; search: string; status: string }): Promise<{ data: TechItem[]; total: number }> {
  const url = new URL("/api/v1/technicians", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch technicians");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success", busy: "bg-warning/10 text-warning", off_duty: "bg-muted text-muted-foreground",
};

export function TechniciansClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TechItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TechItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["technicians", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchTechs({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const isEdit = !!values.id;
      const res = await fetch(isEdit ? `/api/v1/technicians/${values.id}` : "/api/v1/technicians", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "Failed to save");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technicians"] });
      toast.success("Saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/technicians/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["technicians"] });
      toast.success("Deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<TechItem>[]>(
    () => [
      {
        id: "name",
        header: "Technician",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", STATUS_COLORS[row.original.status] ?? "bg-muted")}>
              <HardHat className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">{row.original.name}</p>
              {row.original.employeeId && <p className="text-xs text-muted-foreground">ID: {row.original.employeeId}</p>}
            </div>
          </div>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div className="text-xs space-y-0.5">
            {row.original.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{row.original.phone}</p>}
            {row.original.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{row.original.email}</p>}
            {!row.original.phone && !row.original.email && <span className="text-muted-foreground">—</span>}
          </div>
        ),
      },
      {
        id: "assignments",
        header: "Active Assignments",
        cell: ({ row }) => (
          <span className={cn("text-sm font-medium tabular-nums", row.original.activeAssignments > 0 ? "text-warning" : "text-muted-foreground")}>
            {row.original.activeAssignments}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} label={row.original.status.replace("_", " ")} />,
      },
      {
        id: "created",
        header: "Joined",
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
        title="Technicians"
        description="Manage field technicians, their availability, and active assignments."
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Technician</Button>}
      />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><HardHat className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><HardHat className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((t) => t.status === "active").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><HardHat className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((t) => t.status === "busy").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Busy</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info"><HardHat className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.reduce((s, t) => s + t.activeAssignments, 0)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assignments</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="busy">Busy</SelectItem>
            <SelectItem value="off_duty">Off Duty</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
        searchPlaceholder="Search by name, email, phone, or employee ID…"
        emptyMessage="No technicians"
        emptyDescription="Add a technician to start managing field work."
      />

      {/* Create / Edit dialog */}
      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "New Technician"}</DialogTitle>
            <DialogDescription>{editTarget ? "Update technician details." : "Add a field technician."}</DialogDescription>
          </DialogHeader>
          <TechForm tech={editTarget} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete technician?</AlertDialogTitle>
            <AlertDialogDescription>Delete {deleteTarget?.name}? Cannot delete if they have active assignments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TechForm({ tech, isSaving, onSave }: { tech: TechItem | null; isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    name: tech?.name ?? "",
    phone: tech?.phone ?? "",
    email: tech?.email ?? "",
    employeeId: tech?.employeeId ?? "",
    status: tech?.status ?? "active",
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="t-name">Name *</Label><Input id="t-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="t-phone">Phone</Label><Input id="t-phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="t-email">Email</Label><Input id="t-email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="t-empid">Employee ID</Label><Input id="t-empid" value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))} /></div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="off_duty">Off Duty</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name}>{isSaving ? "Saving…" : "Save"}</Button></DialogFooter>
    </form>
  );
}
