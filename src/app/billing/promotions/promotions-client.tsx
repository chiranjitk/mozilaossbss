// =====================================================================
// PROMOTIONS CLIENT — discount codes / coupons management
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
import { Progress } from "@/components/ui/progress";
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
import { format } from "date-fns";
import {
  Tag,
  Plus,
  Edit,
  Trash2,
  Copy,
  Ticket,
  CheckCircle2,
  CalendarClock,
  Percent,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PromotionItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  type: string; // percentage | flat | free_trial
  value: number;
  maxUses: number | null;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  status: string;
  applicablePlans: string | null;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PromotionFormValues {
  name: string;
  code: string;
  description?: string;
  type: "percentage" | "flat" | "free_trial";
  value: number;
  maxUses?: number | null;
  validFrom: string;
  validUntil: string;
  status: "active" | "expired" | "depleted";
  applicablePlans?: string;
}

const TYPES = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat Amount" },
  { value: "free_trial", label: "Free Trial" },
];

const TYPE_COLORS: Record<string, string> = {
  percentage: "bg-brand/10 text-brand",
  flat: "bg-success/10 text-success",
  free_trial: "bg-info/10 text-info",
};

const TYPE_LABELS: Record<string, string> = {
  percentage: "Percentage",
  flat: "Flat",
  free_trial: "Free Trial",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

async function fetchPromotions(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  type: string;
}): Promise<{ data: PromotionItem[]; total: number }> {
  const url = new URL("/api/v1/promotions", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.type && params.type !== "all") url.searchParams.set("type", params.type);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch promotions");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function savePromotion(
  values: PromotionFormValues & { id?: string }
): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/promotions/${values.id}` : "/api/v1/promotions",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save promotion");
  }
}

async function deletePromotion(id: string): Promise<void> {
  const res = await fetch(`/api/v1/promotions/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete promotion");
  }
}

export function PromotionsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PromotionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromotionItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["promotions", { page, pageSize, search, statusFilter, typeFilter }],
    queryFn: () =>
      fetchPromotions({
        page,
        pageSize,
        search,
        status: statusFilter,
        type: typeFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: PromotionFormValues & { id?: string }) =>
      savePromotion(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Promotion saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePromotion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Promotion deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied", { description: code });
  };

  const columns = useMemo<ColumnDef<PromotionItem>[]>(
    () => [
      {
        id: "name",
        header: "Promotion",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <p className="text-sm font-medium truncate">{row.original.name}</p>
            {row.original.description && (
              <p className="text-xs text-muted-foreground truncate pl-0">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => (
          <button
            onClick={() => handleCopyCode(row.original.code)}
            className="font-mono text-xs text-brand hover:underline flex items-center gap-1"
            title="Click to copy"
          >
            {row.original.code}
            <Copy className="h-3 w-3 opacity-50" />
          </button>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium",
              TYPE_COLORS[row.original.type] ?? "bg-muted text-muted-foreground"
            )}
          >
            {TYPE_LABELS[row.original.type] ?? row.original.type}
          </span>
        ),
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => {
          const v = row.original.value;
          if (row.original.type === "percentage") {
            return (
              <span className="text-sm tabular-nums font-medium flex items-center gap-1">
                {v}%
                <Percent className="h-3 w-3 text-muted-foreground" />
              </span>
            );
          }
          if (row.original.type === "flat") {
            return (
              <span className="text-sm tabular-nums font-medium">
                {formatCurrency(v)}
              </span>
            );
          }
          return (
            <span className="text-xs text-muted-foreground">
              {v} day{v === 1 ? "" : "s"} free
            </span>
          );
        },
      },
      {
        id: "usage",
        header: "Usage",
        cell: ({ row }) => {
          const used = row.original.usedCount;
          const max = row.original.maxUses;
          if (!max) {
            return (
              <span className="text-xs text-muted-foreground tabular-nums">
                {used} used · unlimited
              </span>
            );
          }
          const pct = Math.min(100, Math.round((used / max) * 100));
          return (
            <div className="flex flex-col gap-1 min-w-28">
              <span className="text-xs tabular-nums">
                {used} / {max}
              </span>
              <Progress value={pct} className="h-1.5" />
            </div>
          );
        },
      },
      {
        id: "validPeriod",
        header: "Valid Period",
        cell: ({ row }) => (
          <div className="flex flex-col text-xs">
            <span>
              {format(new Date(row.original.validFrom), "MMM d")} →{" "}
              {format(new Date(row.original.validUntil), "MMM d, yyyy")}
            </span>
            <span
              className={cn(
                "text-[10px]",
                row.original.isExpired ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {row.original.isExpired ? "Expired" : "Active window"}
            </span>
          </div>
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
              aria-label="Edit promotion"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete promotion"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const promotions = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = promotions.filter((p) => p.status === "active" && !p.isExpired).length;
  const expiredCount = promotions.filter((p) => p.isExpired || p.status === "expired").length;
  const totalUsed = promotions.reduce((sum, p) => sum + p.usedCount, 0);

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Manage discount codes, percentage-off coupons, and free trial offers applicable to plans."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Promotion
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Promotions
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
                Active Now
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{expiredCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Expired
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <Ticket className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalUsed}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Times Used
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
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="depleted">Depleted</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={promotions}
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
        searchPlaceholder="Search by name, code, description…"
        emptyMessage="No promotions"
        emptyDescription="Create a promotion to offer discounts and free trials."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-brand" /> New Promotion
            </DialogTitle>
            <DialogDescription>
              Discount codes apply at checkout. Codes are auto-uppercased.
            </DialogDescription>
          </DialogHeader>
          <PromotionForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Promotion
            </DialogTitle>
            <DialogDescription>
              Update <span className="font-medium text-foreground">{editTarget?.name}</span> (
              <code className="font-mono text-xs">{editTarget?.code}</code>)
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <PromotionForm
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
            <AlertDialogTitle>Delete promotion?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> (
              <code className="font-mono">{deleteTarget?.code}</code>). This action cannot be undone.
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

function PromotionForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: PromotionItem;
  isSaving: boolean;
  onSave: (values: PromotionFormValues) => void;
}) {
  const toLocalInput = (date: string | Date) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().slice(0, 16);
  };

  const [form, setForm] = useState<{
    name: string;
    code: string;
    description: string;
    type: PromotionFormValues["type"];
    value: string;
    maxUses: string;
    validFrom: string;
    validUntil: string;
    status: PromotionFormValues["status"];
    applicablePlans: string;
  }>({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    description: initial?.description ?? "",
    type: (initial?.type as PromotionFormValues["type"]) ?? "percentage",
    value: initial?.value?.toString() ?? "10",
    maxUses: initial?.maxUses?.toString() ?? "",
    validFrom: initial ? toLocalInput(initial.validFrom) : toLocalInput(new Date()),
    validUntil: initial
      ? toLocalInput(initial.validUntil)
      : toLocalInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    status: (initial?.status as PromotionFormValues["status"]) ?? "active",
    applicablePlans: initial?.applicablePlans ?? "",
  });

  const valueNum = form.value ? parseFloat(form.value) : 0;
  const maxUsesNum = form.maxUses ? parseInt(form.maxUses, 10) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          code: form.code,
          description: form.description || undefined,
          type: form.type,
          value: valueNum,
          maxUses: maxUsesNum,
          validFrom: new Date(form.validFrom).toISOString(),
          validUntil: new Date(form.validUntil).toISOString(),
          status: form.status,
          applicablePlans: form.applicablePlans || undefined,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-name">Name *</Label>
          <Input
            id="p-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Summer Sale"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-code">Code *</Label>
          <Input
            id="p-code"
            value={form.code}
            onChange={(e) =>
              setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))
            }
            placeholder="SUMMER25"
            className="font-mono"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-desc">Description</Label>
        <Textarea
          id="p-desc"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="25% off for new subscribers…"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={form.type}
            onValueChange={(v: PromotionFormValues["type"]) =>
              setForm((p) => ({ ...p, type: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-value">
            {form.type === "percentage"
              ? "Discount (%)"
              : form.type === "flat"
              ? "Amount (USD)"
              : "Trial Days"}
          </Label>
          <div className="relative">
            <Input
              id="p-value"
              type="number"
              min="0"
              step="any"
              value={form.value}
              onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
              required
              className={form.type !== "flat" ? "pr-9" : "pl-7"}
            />
            {form.type === "flat" && (
              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            )}
            {form.type === "percentage" && (
              <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-from">Valid From *</Label>
          <Input
            id="p-from"
            type="datetime-local"
            value={form.validFrom}
            onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-until">Valid Until *</Label>
          <Input
            id="p-until"
            type="datetime-local"
            value={form.validUntil}
            onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-max">Max Uses (blank = unlimited)</Label>
          <Input
            id="p-max"
            type="number"
            min="1"
            value={form.maxUses}
            onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
            placeholder="unlimited"
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(v: PromotionFormValues["status"]) =>
              setForm((p) => ({ ...p, status: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="depleted">Depleted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-plans">Applicable Plans (comma-separated plan IDs, blank = all)</Label>
        <Input
          id="p-plans"
          value={form.applicablePlans}
          onChange={(e) => setForm((p) => ({ ...p, applicablePlans: e.target.value }))}
          placeholder="plan_basic,plan_premium"
          className="font-mono text-xs"
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name || !form.code}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Promotion"}
        </Button>
      </DialogFooter>
    </form>
  );
}
