// =====================================================================
// ADD-ON SERVICES CLIENT — manage chargeable add-ons (flat / per_day / per_gb / per_month)
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
  Package,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  CalendarDays,
  HardDrive,
  CalendarRange,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AddOnItem {
  id: string;
  name: string;
  description: string | null;
  chargeType: "flat" | "per_day" | "per_gb" | "per_month";
  price: number;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

interface AddOnFormValues {
  name: string;
  description?: string;
  chargeType: "flat" | "per_day" | "per_gb" | "per_month";
  price: number;
  status: "active" | "disabled";
}

const CHARGE_TYPES = [
  { value: "flat", label: "Flat (one-time)", icon: DollarSign },
  { value: "per_day", label: "Per Day", icon: CalendarDays },
  { value: "per_gb", label: "Per GB", icon: HardDrive },
  { value: "per_month", label: "Per Month", icon: CalendarRange },
];

const TYPE_COLORS: Record<string, string> = {
  flat: "bg-brand/10 text-brand",
  per_day: "bg-info/10 text-info",
  per_gb: "bg-success/10 text-success",
  per_month: "bg-warning/10 text-warning",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

const unitFor = (type: string) => {
  switch (type) {
    case "per_day":
      return "/day";
    case "per_gb":
      return "/GB";
    case "per_month":
      return "/month";
    default:
      return "";
  }
};

async function fetchAddOns(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  chargeType: string;
}): Promise<{ data: AddOnItem[]; total: number }> {
  const url = new URL("/api/v1/add-on-services", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.chargeType && params.chargeType !== "all")
    url.searchParams.set("chargeType", params.chargeType);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch add-on services");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveAddOn(values: AddOnFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/add-on-services/${values.id}` : "/api/v1/add-on-services",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save add-on service");
  }
}

async function deleteAddOn(id: string): Promise<void> {
  const res = await fetch(`/api/v1/add-on-services/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete add-on service");
  }
}

export function AddOnsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AddOnItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AddOnItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["add-on-services", { page, pageSize, search, statusFilter, typeFilter }],
    queryFn: () =>
      fetchAddOns({
        page,
        pageSize,
        search,
        status: statusFilter,
        chargeType: typeFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: AddOnFormValues & { id?: string }) => saveAddOn(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["add-on-services"] });
      toast.success("Add-on service saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAddOn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["add-on-services"] });
      toast.success("Add-on service deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<AddOnItem>[]>(
    () => [
      {
        id: "name",
        header: "Service",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <p className="text-sm font-medium truncate">{row.original.name}</p>
            {row.original.description && (
              <p className="text-xs text-muted-foreground truncate">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "chargeType",
        header: "Charge Type",
        cell: ({ row }) => {
          const cfg = CHARGE_TYPES.find((t) => t.value === row.original.chargeType);
          const Icon = cfg?.icon ?? DollarSign;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium",
                TYPE_COLORS[row.original.chargeType] ?? "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-3 w-3" />
              {cfg?.label ?? row.original.chargeType}
            </span>
          );
        },
      },
      {
        id: "price",
        header: "Price",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums font-medium">
            {formatCurrency(row.original.price)}
            <span className="text-[11px] text-muted-foreground ml-1">
              {unitFor(row.original.chargeType)}
            </span>
          </span>
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
              aria-label="Edit add-on service"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete add-on service"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const services = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = services.filter((s) => s.status === "active").length;
  const uniqueTypes = new Set(services.map((s) => s.chargeType)).size;

  return (
    <>
      <PageHeader
        title="Add-on Services"
        description="Define chargeable add-ons like data boosts, static IP, installation fees — billed as flat, per day, per GB, or per month."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Add-on
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Add-ons
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
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{uniqueTypes}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Charge Types
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <DollarSign className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {services.length > 0
                  ? formatCurrency(
                      services.reduce((sum, s) => sum + (s.chargeType === "flat" ? s.price : 0), 0)
                    )
                  : "$0"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Flat Total (page)
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
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-48">
            <SelectValue placeholder="Charge Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All charge types</SelectItem>
            {CHARGE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={services}
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
        searchPlaceholder="Search by name or description…"
        emptyMessage="No add-on services"
        emptyDescription="Create an add-on to charge for data boosts, static IPs, or installation fees."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-brand" /> New Add-on Service
            </DialogTitle>
            <DialogDescription>
              Add-ons can be billed once (flat), per day, per GB of usage, or per month.
            </DialogDescription>
          </DialogHeader>
          <AddOnForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Add-on Service
            </DialogTitle>
            <DialogDescription>
              Update <span className="font-medium text-foreground">{editTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <AddOnForm
              key={editTarget.id}
              initial={editTarget}
              isSaving={saveMutation.isPending}
              onSave={(values) => saveMutation.mutate({ ...values, id: editTarget.id })}
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
            <AlertDialogTitle>Delete add-on service?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. Existing
              subscriber purchases of this add-on are unaffected.
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
    </>
  );
}

// ---------------------------------------------------------------------
// FORM — used for both create and edit
// ---------------------------------------------------------------------

function AddOnForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: AddOnItem;
  isSaving: boolean;
  onSave: (values: AddOnFormValues) => void;
}) {
  const [form, setForm] = useState<{
    name: string;
    description: string;
    chargeType: AddOnFormValues["chargeType"];
    price: string;
    status: AddOnFormValues["status"];
  }>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    chargeType: (initial?.chargeType as AddOnFormValues["chargeType"]) ?? "flat",
    price: initial?.price?.toString() ?? "10",
    status: (initial?.status as AddOnFormValues["status"]) ?? "active",
  });

  const priceNum = form.price ? parseFloat(form.price) : 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          description: form.description || undefined,
          chargeType: form.chargeType,
          price: priceNum,
          status: form.status,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="ao-name">Name *</Label>
        <Input
          id="ao-name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Static IP Address"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ao-desc">Description</Label>
        <Textarea
          id="ao-desc"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="One static public IPv4 address, billed monthly."
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Charge Type</Label>
          <Select
            value={form.chargeType}
            onValueChange={(v: AddOnFormValues["chargeType"]) =>
              setForm((p) => ({ ...p, chargeType: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHARGE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ao-price">
            Price {form.chargeType !== "flat" && `(${unitFor(form.chargeType).replace("/", "")})`}
          </Label>
          <div className="relative">
            <Input
              id="ao-price"
              type="number"
              min="0"
              step="any"
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              className="pl-7"
              required
            />
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={form.status}
          onValueChange={(v: AddOnFormValues["status"]) =>
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
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Add-on"}
        </Button>
      </DialogFooter>
    </form>
  );
}
