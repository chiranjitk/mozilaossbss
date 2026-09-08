// =====================================================================
// AREAS CLIENT — geographic zones & coverage management
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  Edit,
  Trash2,
  MapPinned,
  CheckCircle2,
  Building2,
  Globe2,
} from "lucide-react";

interface AreaItem {
  id: string;
  name: string;
  description: string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface AreaFormValues {
  name: string;
  description?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
  status: "active" | "disabled";
  sortOrder?: number;
}

async function fetchAreas(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: AreaItem[]; total: number }> {
  const url = new URL("/api/v1/areas", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch areas");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveArea(values: AreaFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(isEdit ? `/api/v1/areas/${values.id}` : "/api/v1/areas", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save area");
  }
}

async function deleteArea(id: string): Promise<void> {
  const res = await fetch(`/api/v1/areas/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete area");
  }
}

export function AreasClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AreaItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AreaItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["areas", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchAreas({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: AreaFormValues & { id?: string }) => saveArea(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["areas"] });
      toast.success("Area saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteArea(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["areas"] });
      toast.success("Area deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<AreaItem>[]>(
    () => [
      {
        id: "name",
        header: "Area",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-brand shrink-0" />
              <p className="text-sm font-medium truncate">{row.original.name}</p>
            </div>
            {row.original.description && (
              <p className="text-xs text-muted-foreground truncate pl-5">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "city",
        header: "City",
        cell: ({ row }) =>
          row.original.city ? (
            <span className="text-sm">{row.original.city}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "state",
        header: "State",
        cell: ({ row }) =>
          row.original.state ? (
            <span className="text-sm">{row.original.state}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "pincode",
        header: "Pincode",
        cell: ({ row }) =>
          row.original.pincode ? (
            <code className="text-xs font-mono text-muted-foreground">
              {row.original.pincode}
            </code>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
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
              aria-label="Edit area"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete area"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  // Derived stats from the current page's full count response (total + sample)
  const areas = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = areas.filter((a) => a.status === "active").length;
  const citiesCovered = new Set(areas.map((a) => a.city).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        title="Areas & Zones"
        description="Manage geographic coverage zones for network planning, installations, and field operations."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Area
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <MapPinned className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Areas
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
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{citiesCovered}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Cities Covered
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
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={areas}
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
        searchPlaceholder="Search by name, city, state, pincode…"
        emptyMessage="No areas"
        emptyDescription="Create an area to start tracking geographic coverage."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-brand" /> New Area
            </DialogTitle>
            <DialogDescription>
              Define a geographic zone for installations and coverage tracking.
            </DialogDescription>
          </DialogHeader>
          <AreaForm
            isSaving={saveMutation.isPending}
            onSave={(values) => saveMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-brand" /> Edit Area
            </DialogTitle>
            <DialogDescription>
              Update <span className="font-medium text-foreground">{editTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <AreaForm
              key={editTarget.id}
              initial={editTarget}
              isSaving={saveMutation.isPending}
              onSave={(values) =>
                saveMutation.mutate({ ...values, id: editTarget.id })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete area?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>.
              This action cannot be undone.
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

      {/* Helper footer for global context */}
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Globe2 className="h-3.5 w-3.5" />
        Coordinates use WGS84 (latitude / longitude) decimal degrees.
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// FORM — used for both create and edit
// ---------------------------------------------------------------------

function AreaForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: AreaItem;
  isSaving: boolean;
  onSave: (values: AreaFormValues) => void;
}) {
  const [form, setForm] = useState<{
    name: string;
    description: string;
    city: string;
    state: string;
    pincode: string;
    latitude: string;
    longitude: string;
    status: "active" | "disabled";
    sortOrder: string;
  }>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    pincode: initial?.pincode ?? "",
    latitude: initial?.latitude?.toString() ?? "",
    longitude: initial?.longitude?.toString() ?? "",
    status: (initial?.status as "active" | "disabled") ?? "active",
    sortOrder: initial?.sortOrder?.toString() ?? "0",
  });

  const lat = form.latitude ? parseFloat(form.latitude) : null;
  const lng = form.longitude ? parseFloat(form.longitude) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          description: form.description || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          pincode: form.pincode || undefined,
          latitude: lat,
          longitude: lng,
          status: form.status,
          sortOrder: form.sortOrder ? parseInt(form.sortOrder, 10) : 0,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="a-name">Name *</Label>
        <Input
          id="a-name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Andheri East"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="a-desc">Description</Label>
        <Textarea
          id="a-desc"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Coverage notes, boundaries, POP details…"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="a-city">City</Label>
          <Input
            id="a-city"
            value={form.city}
            onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            placeholder="Mumbai"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="a-state">State</Label>
          <Input
            id="a-state"
            value={form.state}
            onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
            placeholder="Maharashtra"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="a-pin">Pincode</Label>
          <Input
            id="a-pin"
            value={form.pincode}
            onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))}
            placeholder="400069"
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(v: "active" | "disabled") =>
              setForm((p) => ({ ...p, status: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="a-lat">Latitude</Label>
          <Input
            id="a-lat"
            type="number"
            step="any"
            value={form.latitude}
            onChange={(e) => setForm((p) => ({ ...p, latitude: e.target.value }))}
            placeholder="19.1136"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="a-lng">Longitude</Label>
          <Input
            id="a-lng"
            type="number"
            step="any"
            value={form.longitude}
            onChange={(e) => setForm((p) => ({ ...p, longitude: e.target.value }))}
            placeholder="72.8697"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="a-sort">Sort Order</Label>
        <Input
          id="a-sort"
          type="number"
          min="0"
          value={form.sortOrder}
          onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
          placeholder="0"
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Area"}
        </Button>
      </DialogFooter>
    </form>
  );
}
