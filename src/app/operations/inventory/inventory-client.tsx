// =====================================================================
// INVENTORY CLIENT — list, create, edit, delete, stock tracking
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Boxes, Plus, Edit, Trash2, Package, AlertTriangle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface InvItem {
  id: string; name: string; sku: string | null; category: string; description: string | null;
  unit: string; quantity: number; minQuantity: number; reorderPoint: number;
  unitCost: number; unitPrice: number | null; location: string | null; status: string;
  needsReorder: boolean; stockValue: number;
}

async function fetchInv(params: { page: number; pageSize: number; search: string; status: string; category: string }): Promise<{ data: InvItem[]; total: number }> {
  const url = new URL("/api/v1/inventory", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.category && params.category !== "all") url.searchParams.set("category", params.category);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const CATEGORY_LABELS: Record<string, string> = { networking: "Networking", cpe: "CPE", cable: "Cable", accessory: "Accessory", tool: "Tool" };
const CATEGORY_COLORS: Record<string, string> = { networking: "bg-brand/10 text-brand", cpe: "bg-info/10 text-info", cable: "bg-success/10 text-success", accessory: "bg-warning/10 text-warning", tool: "bg-muted text-muted-foreground" };

const formatCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

export function InventoryClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InvItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["inventory", { page, pageSize, search, statusFilter, categoryFilter }],
    queryFn: () => fetchInv({ page, pageSize, search, status: statusFilter, category: categoryFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const isEdit = !!values.id;
      const res = await fetch(isEdit ? `/api/v1/inventory/${values.id}` : "/api/v1/inventory", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inventory"] }); toast.success("Saved"); setCreateOpen(false); setEditTarget(null); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/inventory/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inventory"] }); toast.success("Deleted"); setDeleteTarget(null); },
    onError: () => toast.error("Delete failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<InvItem>[]>(() => [
    { id: "name", header: "Item", cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.name}</p>{row.original.sku && <code className="text-xs text-muted-foreground font-mono">{row.original.sku}</code>}</div> },
    { id: "category", header: "Category", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", CATEGORY_COLORS[row.original.category] ?? "bg-muted")}>{CATEGORY_LABELS[row.original.category] ?? row.original.category}</span> },
    { id: "qty", header: "Quantity", cell: ({ row }) => <div className="text-sm tabular-nums"><p className={cn("font-medium", row.original.needsReorder && "text-warning")}>{row.original.quantity} {row.original.unit}</p><p className="text-xs text-muted-foreground">Min: {row.original.minQuantity} · Reorder: {row.original.reorderPoint}</p></div> },
    { id: "cost", header: "Unit Cost", cell: ({ row }) => <span className="text-sm tabular-nums">{formatCurrency(row.original.unitCost)}</span> },
    { id: "stockValue", header: "Stock Value", cell: ({ row }) => <span className="text-sm tabular-nums font-medium">{formatCurrency(row.original.stockValue)}</span> },
    { id: "location", header: "Location", cell: ({ row }) => row.original.location ? <span className="text-xs">{row.original.location}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} label={row.original.status.replace(/_/g, " ")} /> },
    { id: "actions", header: "", cell: ({ row }) => <div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button></div> },
  ], []);

  return (
    <>
      <PageHeader title="Inventory" description="Track equipment, CPE, cables, and accessories. Monitor stock levels and reorder points." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Item</Button>} />
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Boxes className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Items</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><Package className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((i) => i.status === "in_stock").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">In Stock</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><AlertTriangle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((i) => i.needsReorder).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Need Reorder</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><DollarSign className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{formatCurrency(data.data.reduce((s, i) => s + i.stockValue, 0))}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Value</p></div></div></Card>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="in_stock">In Stock</SelectItem><SelectItem value="low_stock">Low Stock</SelectItem><SelectItem value="out_of_stock">Out of Stock</SelectItem><SelectItem value="reserved">Reserved</SelectItem></SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{Object.entries(CATEGORY_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search by name or SKU…" emptyMessage="No inventory items" emptyDescription="Add equipment to start tracking stock." />
      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "New Inventory Item"}</DialogTitle><DialogDescription>{editTarget ? "Update stock levels and details." : "Add equipment to inventory."}</DialogDescription></DialogHeader>
          <InvForm item={editTarget} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete item?</AlertDialogTitle><AlertDialogDescription>Delete {deleteTarget?.name} from inventory?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InvForm({ item, isSaving, onSave }: { item: InvItem | null; isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    name: item?.name ?? "", sku: item?.sku ?? "", category: item?.category ?? "networking",
    description: item?.description ?? "", unit: item?.unit ?? "unit",
    quantity: String(item?.quantity ?? 0), minQuantity: String(item?.minQuantity ?? 0),
    reorderPoint: String(item?.reorderPoint ?? 5), unitCost: String(item?.unitCost ?? 0),
    unitPrice: String(item?.unitPrice ?? ""), location: item?.location ?? "",
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, quantity: Number(form.quantity), minQuantity: Number(form.minQuantity), reorderPoint: Number(form.reorderPoint), unitCost: Number(form.unitCost), unitPrice: form.unitPrice ? Number(form.unitPrice) : undefined }); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="inv-name">Name *</Label><Input id="inv-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Unit</Label><Select value={form.unit} onValueChange={(v) => setForm((p) => ({ ...p, unit: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unit">Unit</SelectItem><SelectItem value="meter">Meter</SelectItem><SelectItem value="box">Box</SelectItem><SelectItem value="roll">Roll</SelectItem></SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2"><Label htmlFor="inv-qty">Quantity</Label><Input id="inv-qty" type="number" min="0" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="inv-min">Min Qty</Label><Input id="inv-min" type="number" min="0" value={form.minQuantity} onChange={(e) => setForm((p) => ({ ...p, minQuantity: e.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="inv-reorder">Reorder At</Label><Input id="inv-reorder" type="number" min="0" value={form.reorderPoint} onChange={(e) => setForm((p) => ({ ...p, reorderPoint: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="inv-cost">Unit Cost *</Label><Input id="inv-cost" type="number" step="0.01" min="0" value={form.unitCost} onChange={(e) => setForm((p) => ({ ...p, unitCost: e.target.value }))} required /></div>
        <div className="space-y-2"><Label htmlFor="inv-price">Unit Price</Label><Input id="inv-price" type="number" step="0.01" min="0" value={form.unitPrice} onChange={(e) => setForm((p) => ({ ...p, unitPrice: e.target.value }))} /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="inv-loc">Location</Label><Input id="inv-loc" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Warehouse A / Shelf 3" /></div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name}>{isSaving ? "Saving…" : "Save"}</Button></DialogFooter>
    </form>
  );
}
