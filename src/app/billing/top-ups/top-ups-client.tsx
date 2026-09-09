// =====================================================================
// TOP-UPS CLIENT — manage data / time / speed_boost top-ups
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format, formatDistanceToNow, isBefore } from "date-fns";
import {
  Zap,
  Plus,
  Edit,
  Trash2,
  Gauge,
  Clock,
  Rocket,
  DollarSign,
  CheckCircle2,
  User,
  Hourglass,
  TimerReset,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriberMini {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
}

interface TopUpItem {
  id: string;
  subscriberId: string;
  type: "data" | "time" | "speed_boost";
  amount: number;
  price: number;
  status: "active" | "used" | "expired" | "cancelled";
  expiresAt: string | null;
  createdAt: string;
  subscriber?: SubscriberMini | null;
}

interface TopUpFormValues {
  subscriberId: string;
  type: "data" | "time" | "speed_boost";
  amount: number;
  price: number;
  status: "active" | "used" | "expired" | "cancelled";
  expiresAt?: string | null;
}

const TYPES = [
  { value: "data", label: "Data (GB)", icon: Gauge, unit: "GB" },
  { value: "time", label: "Time (hours)", icon: Clock, unit: "hours" },
  { value: "speed_boost", label: "Speed Boost (kbps)", icon: Rocket, unit: "kbps" },
];

const TYPE_COLORS: Record<string, string> = {
  data: "bg-info/10 text-info",
  time: "bg-brand/10 text-brand",
  speed_boost: "bg-warning/10 text-warning",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

const unitFor = (type: string) =>
  TYPES.find((t) => t.value === type)?.unit ?? "";

async function fetchTopUps(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  type: string;
}): Promise<{ data: TopUpItem[]; total: number }> {
  const url = new URL("/api/v1/top-ups", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.type && params.type !== "all") url.searchParams.set("type", params.type);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch top-ups");
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

async function saveTopUp(values: TopUpFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/top-ups/${values.id}` : "/api/v1/top-ups",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save top-up");
  }
}

async function deleteTopUp(id: string): Promise<void> {
  const res = await fetch(`/api/v1/top-ups/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete top-up");
  }
}

export function TopUpsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TopUpItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TopUpItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["top-ups", { page, pageSize, search, statusFilter, typeFilter }],
    queryFn: () =>
      fetchTopUps({
        page,
        pageSize,
        search,
        status: statusFilter,
        type: typeFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: TopUpFormValues & { id?: string }) => saveTopUp(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["top-ups"] });
      toast.success("Top-up saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTopUp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["top-ups"] });
      toast.success("Top-up deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<TopUpItem>[]>(
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
          const cfg = TYPES.find((t) => t.value === row.original.type);
          const Icon = cfg?.icon ?? Zap;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium",
                TYPE_COLORS[row.original.type] ?? "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-3 w-3" />
              {cfg?.label.split(" ")[0] ?? row.original.type}
            </span>
          );
        },
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums font-medium">
            {row.original.amount}
            <span className="text-[11px] text-muted-foreground ml-1">
              {unitFor(row.original.type)}
            </span>
          </span>
        ),
      },
      {
        id: "price",
        header: "Price",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums font-medium">
            {formatCurrency(row.original.price)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "expiresAt",
        header: "Expiry",
        cell: ({ row }) => {
          if (!row.original.expiresAt) {
            return <span className="text-xs text-muted-foreground">No expiry</span>;
          }
          const d = new Date(row.original.expiresAt);
          const isPast = isBefore(d, new Date());
          return (
            <div className="flex flex-col text-xs">
              <span className="tabular-nums">{format(d, "MMM d, yyyy")}</span>
              <span className={cn("text-[10px]", isPast ? "text-destructive" : "text-muted-foreground")}>
                {isPast ? "expired " : "expires "}
                {formatDistanceToNow(d, { addSuffix: true })}
              </span>
            </div>
          );
        },
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
              aria-label="Edit top-up"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete top-up"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const topUps = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = topUps.filter((t) => t.status === "active").length;
  const usedCount = topUps.filter((t) => t.status === "used").length;
  const expiredCount = topUps.filter(
    (t) => t.status === "expired" || (t.expiresAt && isBefore(new Date(t.expiresAt), new Date()))
  ).length;

  return (
    <>
      <PageHeader
        title="Top-Ups"
        description="One-time boost purchases — additional data, session time extensions, or temporary speed upgrades."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Top-Up
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Top-Ups
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
              <TimerReset className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{usedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Used
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <Hourglass className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{expiredCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Expired
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
            <SelectItem value="used">Used</SelectItem>
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
        data={topUps}
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
        searchPlaceholder="Search by subscriber name or ID…"
        emptyMessage="No top-ups"
        emptyDescription="Create a top-up to grant a subscriber extra data, time, or a speed boost."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-brand" /> New Top-Up
            </DialogTitle>
            <DialogDescription>
              Top-ups are one-time boosts that apply immediately to the subscriber&apos;s account.
            </DialogDescription>
          </DialogHeader>
          <TopUpForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Top-Up
            </DialogTitle>
            <DialogDescription>
              Update top-up for{" "}
              {editTarget?.subscriber
                ? `${editTarget.subscriber.firstName} ${editTarget.subscriber.lastName}`
                : "subscriber"}
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <TopUpForm
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
            <AlertDialogTitle>Delete top-up?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the {deleteTarget?.type} top-up
              {deleteTarget?.subscriber
                ? ` for ${deleteTarget.subscriber.firstName} ${deleteTarget.subscriber.lastName}`
                : ""}
              . The subscriber will lose any unused benefit.
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

function TopUpForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: TopUpItem;
  isSaving: boolean;
  onSave: (values: TopUpFormValues) => void;
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
    type: TopUpFormValues["type"];
    amount: string;
    price: string;
    status: TopUpFormValues["status"];
    expiresAt: string;
  }>({
    subscriberId: initial?.subscriberId ?? "",
    type: (initial?.type as TopUpFormValues["type"]) ?? "data",
    amount: initial?.amount?.toString() ?? "5",
    price: initial?.price?.toString() ?? "50",
    status: (initial?.status as TopUpFormValues["status"]) ?? "active",
    expiresAt: initial ? toLocalInput(initial.expiresAt) : "",
  });

  const amountNum = form.amount ? parseFloat(form.amount) : 0;
  const priceNum = form.price ? parseFloat(form.price) : 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          subscriberId: form.subscriberId,
          type: form.type,
          amount: amountNum,
          price: priceNum,
          status: form.status,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="tu-sub">Subscriber *</Label>
        <Select
          value={form.subscriberId}
          onValueChange={(v) => setForm((p) => ({ ...p, subscriberId: v }))}
        >
          <SelectTrigger id="tu-sub">
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
            onValueChange={(v: TopUpFormValues["type"]) => setForm((p) => ({ ...p, type: v }))}
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
          <Label htmlFor="tu-amount">Amount ({unitFor(form.type)}) *</Label>
          <Input
            id="tu-amount"
            type="number"
            min="0"
            step="any"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="tu-price">Price ($) *</Label>
          <div className="relative">
            <Input
              id="tu-price"
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
        <div className="space-y-2">
          <Label htmlFor="tu-exp">Expires At (optional)</Label>
          <Input
            id="tu-exp"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={form.status}
          onValueChange={(v: TopUpFormValues["status"]) => setForm((p) => ({ ...p, status: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button
          type="submit"
          disabled={isSaving || !form.subscriberId || amountNum < 0 || priceNum < 0}
        >
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Top-Up"}
        </Button>
      </DialogFooter>
    </form>
  );
}
