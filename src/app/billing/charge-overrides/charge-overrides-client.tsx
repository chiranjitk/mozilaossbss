// =====================================================================
// CHARGE OVERRIDES CLIENT — per-subscriber discount / surcharge rules
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
import { format, isAfter, isBefore } from "date-fns";
import {
  SlidersHorizontal,
  Plus,
  Edit,
  Trash2,
  TrendingDown,
  TrendingUp,
  Percent,
  DollarSign,
  CheckCircle2,
  User,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriberMini {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
}

interface ChargeOverrideItem {
  id: string;
  subscriberId: string;
  type: "discount" | "surcharge";
  value: number;
  valueType: "percentage" | "flat";
  reason: string | null;
  status: "active" | "expired" | "cancelled";
  startDate: string;
  endDate: string | null;
  createdAt: string;
  subscriber?: SubscriberMini | null;
}

interface ChargeFormValues {
  subscriberId: string;
  type: "discount" | "surcharge";
  value: number;
  valueType: "percentage" | "flat";
  reason?: string;
  status: "active" | "expired" | "cancelled";
  startDate: string;
  endDate?: string | null;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);

async function fetchOverrides(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  type: string;
}): Promise<{ data: ChargeOverrideItem[]; total: number }> {
  const url = new URL("/api/v1/charge-overrides", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.type && params.type !== "all") url.searchParams.set("type", params.type);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch charge overrides");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchSubscribers(): Promise<SubscriberMini[]> {
  const res = await fetch("/api/v1/subscribers?pageSize=100", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch subscribers");
  const json = await res.json();
  return json.data.map((s: any) => ({
    id: s.id,
    customerId: s.customerId,
    firstName: s.firstName,
    lastName: s.lastName,
  }));
}

async function saveOverride(values: ChargeFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/charge-overrides/${values.id}` : "/api/v1/charge-overrides",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save charge override");
  }
}

async function deleteOverride(id: string): Promise<void> {
  const res = await fetch(`/api/v1/charge-overrides/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete charge override");
  }
}

export function ChargeOverridesClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChargeOverrideItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChargeOverrideItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["charge-overrides", { page, pageSize, search, statusFilter, typeFilter }],
    queryFn: () =>
      fetchOverrides({
        page,
        pageSize,
        search,
        status: statusFilter,
        type: typeFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: ChargeFormValues & { id?: string }) => saveOverride(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-overrides"] });
      toast.success("Charge override saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-overrides"] });
      toast.success("Charge override deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<ChargeOverrideItem>[]>(
    () => [
      {
        id: "subscriber",
        header: "Subscriber",
        cell: ({ row }) => {
          const s = row.original.subscriber;
          return (
            <div className="max-w-xs">
              {s ? (
                <>
                  <p className="text-sm font-medium truncate">
                    {s.firstName} {s.lastName}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {s.customerId}
                  </p>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => {
          const isDiscount = row.original.type === "discount";
          const Icon = isDiscount ? TrendingDown : TrendingUp;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium",
                isDiscount ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
              )}
            >
              <Icon className="h-3 w-3" />
              {isDiscount ? "Discount" : "Surcharge"}
            </span>
          );
        },
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => {
          const isPct = row.original.valueType === "percentage";
          return (
            <span className="text-sm tabular-nums font-medium flex items-center gap-1">
              {isPct ? (
                <>
                  {row.original.value}%
                  <Percent className="h-3 w-3 text-muted-foreground" />
                </>
              ) : (
                <>
                  {formatCurrency(row.original.value)}
                </>
              )}
              <span className="text-[11px] text-muted-foreground ml-1">
                ({row.original.valueType})
              </span>
            </span>
          );
        },
      },
      {
        id: "reason",
        header: "Reason",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground line-clamp-1 max-w-[180px]">
            {row.original.reason ?? "—"}
          </span>
        ),
      },
      {
        id: "validity",
        header: "Validity",
        cell: ({ row }) => (
          <div className="flex flex-col text-xs">
            <span className="tabular-nums">
              {format(new Date(row.original.startDate), "MMM d, yyyy")}
              {row.original.endDate
                ? ` → ${format(new Date(row.original.endDate), "MMM d, yyyy")}`
                : " → ∞"}
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
              aria-label="Edit charge override"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete charge override"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const overrides = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = overrides.filter((o) => o.status === "active").length;
  const discountCount = overrides.filter((o) => o.type === "discount").length;
  const surchargeCount = overrides.filter((o) => o.type === "surcharge").length;

  return (
    <>
      <PageHeader
        title="Charge Overrides"
        description="Per-subscriber discount or surcharge rules applied automatically to every invoice, optionally time-bound."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Override
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Overrides
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
              <TrendingDown className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{discountCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Discounts
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{surchargeCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Surcharges
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
            <SelectItem value="cancelled">Cancelled</SelectItem>
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
            <SelectItem value="discount">Discount</SelectItem>
            <SelectItem value="surcharge">Surcharge</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={overrides}
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
        searchPlaceholder="Search by subscriber, ID, or reason…"
        emptyMessage="No charge overrides"
        emptyDescription="Create an override to apply a discount or surcharge to all of a subscriber's invoices."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-brand" /> New Charge Override
            </DialogTitle>
            <DialogDescription>
              Apply a recurring discount or surcharge to every invoice for this subscriber.
            </DialogDescription>
          </DialogHeader>
          <ChargeForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Charge Override
            </DialogTitle>
            <DialogDescription>
              Update override for{" "}
              {editTarget?.subscriber
                ? `${editTarget.subscriber.firstName} ${editTarget.subscriber.lastName}`
                : "subscriber"}
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <ChargeForm
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
            <AlertDialogTitle>Delete charge override?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            This will permanently delete the {deleteTarget?.type} for{" "}
            {deleteTarget?.subscriber
              ? `${deleteTarget.subscriber.firstName} ${deleteTarget.subscriber.lastName}`
              : "the subscriber"}
            . Future invoices will use the standard plan price.
          </AlertDialogDescription>
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

function ChargeForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: ChargeOverrideItem;
  isSaving: boolean;
  onSave: (values: ChargeFormValues) => void;
}) {
  const { data: subscribers, isLoading: subsLoading } = useQuery({
    queryKey: ["subscribers-mini"],
    queryFn: fetchSubscribers,
    staleTime: 60_000,
  });

  const toLocalInput = (date: string | Date | null) => {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().slice(0, 16);
  };

  const [form, setForm] = useState<{
    subscriberId: string;
    type: ChargeFormValues["type"];
    valueType: ChargeFormValues["valueType"];
    value: string;
    reason: string;
    status: ChargeFormValues["status"];
    startDate: string;
    endDate: string;
  }>({
    subscriberId: initial?.subscriberId ?? "",
    type: (initial?.type as ChargeFormValues["type"]) ?? "discount",
    valueType: (initial?.valueType as ChargeFormValues["valueType"]) ?? "percentage",
    value: initial?.value?.toString() ?? "10",
    reason: initial?.reason ?? "",
    status: (initial?.status as ChargeFormValues["status"]) ?? "active",
    startDate: initial ? toLocalInput(initial.startDate) : toLocalInput(new Date()),
    endDate: initial ? toLocalInput(initial.endDate) : "",
  });

  const valueNum = form.value ? parseFloat(form.value) : 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          subscriberId: form.subscriberId,
          type: form.type,
          value: valueNum,
          valueType: form.valueType,
          reason: form.reason || undefined,
          status: form.status,
          startDate: new Date(form.startDate).toISOString(),
          endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="co-sub">Subscriber *</Label>
        <Select
          value={form.subscriberId}
          onValueChange={(v) => setForm((p) => ({ ...p, subscriberId: v }))}
        >
          <SelectTrigger id="co-sub">
            <SelectValue placeholder={subsLoading ? "Loading subscribers…" : "Select a subscriber"} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {subscribers?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <User className="h-3 w-3 text-muted-foreground" />
                  {s.firstName} {s.lastName}
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {s.customerId}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={form.type}
            onValueChange={(v: ChargeFormValues["type"]) => setForm((p) => ({ ...p, type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="discount">Discount</SelectItem>
              <SelectItem value="surcharge">Surcharge</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Value Type</Label>
          <Select
            value={form.valueType}
            onValueChange={(v: ChargeFormValues["valueType"]) =>
              setForm((p) => ({ ...p, valueType: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
              <SelectItem value="flat">Flat Amount ($)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="co-value">
          {form.valueType === "percentage" ? "Value (%)" : "Value ($)"}
        </Label>
        <div className="relative">
          <Input
            id="co-value"
            type="number"
            min="0"
            max={form.valueType === "percentage" ? 100 : undefined}
            step="any"
            value={form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
            className={form.valueType === "flat" ? "pl-7" : "pr-9"}
            required
          />
          {form.valueType === "flat" ? (
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="co-reason">Reason</Label>
        <Textarea
          id="co-reason"
          value={form.reason}
          onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
          placeholder="Loyalty discount, special pricing agreement, premium installation surcharge…"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="co-start">Start Date *</Label>
          <Input
            id="co-start"
            type="datetime-local"
            value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="co-end">End Date (optional)</Label>
          <Input
            id="co-end"
            type="datetime-local"
            value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={form.status}
          onValueChange={(v: ChargeFormValues["status"]) => setForm((p) => ({ ...p, status: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.startDate && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CalendarRange className="h-3 w-3" />
          {form.endDate
            ? `Applies from ${format(new Date(form.startDate), "MMM d")} to ${format(new Date(form.endDate), "MMM d, yyyy")}`
            : `Applies from ${format(new Date(form.startDate), "MMM d, yyyy")} indefinitely`}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.subscriberId || valueNum < 0}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Override"}
        </Button>
      </DialogFooter>
    </form>
  );
}
