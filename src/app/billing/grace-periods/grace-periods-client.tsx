// =====================================================================
// GRACE PERIODS CLIENT — manage pre/post billing grace windows
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
import { format, formatDistanceToNow, isAfter, isBefore } from "date-fns";
import {
  CalendarClock,
  Plus,
  Edit,
  Trash2,
  ShieldAlert,
  CalendarDays,
  CheckCircle2,
  User,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriberMini {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
}

interface GracePeriodItem {
  id: string;
  subscriberId: string;
  type: "pre_billing" | "post_billing";
  status: "active" | "suspended" | "cancelled" | "expired";
  startDate: string;
  endDate: string;
  days: number;
  createdAt: string;
  updatedAt: string;
  subscriber?: SubscriberMini | null;
}

interface GraceFormValues {
  subscriberId: string;
  type: "pre_billing" | "post_billing";
  status: "active" | "suspended" | "cancelled" | "expired";
  days: number;
  startDate: string;
}

const TYPE_LABELS: Record<string, string> = {
  pre_billing: "Pre-Billing",
  post_billing: "Post-Billing",
};

const TYPE_COLORS: Record<string, string> = {
  pre_billing: "bg-info/10 text-info",
  post_billing: "bg-brand/10 text-brand",
};

async function fetchGracePeriods(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  type: string;
}): Promise<{ data: GracePeriodItem[]; total: number }> {
  const url = new URL("/api/v1/grace-periods", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.type && params.type !== "all") url.searchParams.set("type", params.type);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch grace periods");
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

async function saveGrace(values: GraceFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/grace-periods/${values.id}` : "/api/v1/grace-periods",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save grace period");
  }
}

async function deleteGrace(id: string): Promise<void> {
  const res = await fetch(`/api/v1/grace-periods/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete grace period");
  }
}

export function GracePeriodsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GracePeriodItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GracePeriodItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["grace-periods", { page, pageSize, search, statusFilter, typeFilter }],
    queryFn: () =>
      fetchGracePeriods({
        page,
        pageSize,
        search,
        status: statusFilter,
        type: typeFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: GraceFormValues & { id?: string }) => saveGrace(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grace-periods"] });
      toast.success("Grace period saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGrace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grace-periods"] });
      toast.success("Grace period deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<GracePeriodItem>[]>(
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
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "startDate",
        header: "Start Date",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {format(new Date(row.original.startDate), "MMM d, yyyy")}
          </span>
        ),
      },
      {
        id: "endDate",
        header: "End Date",
        cell: ({ row }) => {
          const end = new Date(row.original.endDate);
          const isPast = isBefore(end, new Date());
          return (
            <div className="flex flex-col text-xs">
              <span className="tabular-nums">{format(end, "MMM d, yyyy")}</span>
              <span className={cn("text-[10px]", isPast ? "text-destructive" : "text-muted-foreground")}>
                {isPast ? "ended " : "ends "}
                {formatDistanceToNow(end, { addSuffix: true })}
              </span>
            </div>
          );
        },
      },
      {
        id: "days",
        header: "Days",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums font-medium flex items-center gap-1">
            <Hourglass className="h-3 w-3 text-muted-foreground" />
            {row.original.days}d
          </span>
        ),
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
              aria-label="Edit grace period"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete grace period"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const periods = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = periods.filter((p) => p.status === "active").length;
  const expiringCount = periods.filter((p) => {
    const end = new Date(p.endDate);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return isAfter(end, new Date()) && end.getTime() - Date.now() < sevenDays;
  }).length;
  const expiredCount = periods.filter(
    (p) => p.status === "expired" || isBefore(new Date(p.endDate), new Date())
  ).length;

  return (
    <>
      <PageHeader
        title="Grace Periods"
        description="Grant subscribers temporary pre-billing or post-billing grace windows before suspension is triggered."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Grace Period
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Grace Periods
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
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{expiringCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Expiring ≤ 7d
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
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
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
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
            <SelectItem value="pre_billing">Pre-Billing</SelectItem>
            <SelectItem value="post_billing">Post-Billing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={periods}
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
        emptyMessage="No grace periods"
        emptyDescription="Create a grace period to give subscribers a payment extension."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-brand" /> New Grace Period
            </DialogTitle>
            <DialogDescription>
              Grant a temporary grace window before suspension kicks in.
            </DialogDescription>
          </DialogHeader>
          <GraceForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Grace Period
            </DialogTitle>
            <DialogDescription>
              Update grace window for{" "}
              {editTarget?.subscriber
                ? `${editTarget.subscriber.firstName} ${editTarget.subscriber.lastName}`
                : "subscriber"}
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <GraceForm
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
            <AlertDialogTitle>Delete grace period?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the grace period
              {deleteTarget?.subscriber
                ? ` for ${deleteTarget.subscriber.firstName} ${deleteTarget.subscriber.lastName}`
                : ""}
              . The subscriber may be subject to immediate suspension if invoices are overdue.
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

function GraceForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: GracePeriodItem;
  isSaving: boolean;
  onSave: (values: GraceFormValues) => void;
}) {
  const { data: subscribers, isLoading: subsLoading } = useQuery({
    queryKey: ["subscribers-mini"],
    queryFn: fetchSubscribers,
    staleTime: 60_000,
  });

  const toLocalInput = (date: string | Date) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().slice(0, 16);
  };

  const [form, setForm] = useState<{
    subscriberId: string;
    type: GraceFormValues["type"];
    status: GraceFormValues["status"];
    days: string;
    startDate: string;
  }>({
    subscriberId: initial?.subscriberId ?? "",
    type: (initial?.type as GraceFormValues["type"]) ?? "post_billing",
    status: (initial?.status as GraceFormValues["status"]) ?? "active",
    days: initial?.days?.toString() ?? "7",
    startDate: initial ? toLocalInput(initial.startDate) : toLocalInput(new Date()),
  });

  const daysNum = form.days ? parseInt(form.days, 10) : 0;
  const computedEnd =
    form.startDate && daysNum > 0
      ? new Date(new Date(form.startDate).getTime() + daysNum * 24 * 60 * 60 * 1000)
      : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          subscriberId: form.subscriberId,
          type: form.type,
          status: form.status,
          days: daysNum,
          startDate: new Date(form.startDate).toISOString(),
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="gp-sub">Subscriber *</Label>
        <Select
          value={form.subscriberId}
          onValueChange={(v) => setForm((p) => ({ ...p, subscriberId: v }))}
        >
          <SelectTrigger id="gp-sub">
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
            onValueChange={(v: GraceFormValues["type"]) => setForm((p) => ({ ...p, type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pre_billing">Pre-Billing</SelectItem>
              <SelectItem value="post_billing">Post-Billing</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(v: GraceFormValues["status"]) => setForm((p) => ({ ...p, status: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="gp-start">Start Date *</Label>
          <Input
            id="gp-start"
            type="datetime-local"
            value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gp-days">Duration (days) *</Label>
          <Input
            id="gp-days"
            type="number"
            min="1"
            max="365"
            value={form.days}
            onChange={(e) => setForm((p) => ({ ...p, days: e.target.value }))}
            required
          />
        </div>
      </div>
      {computedEnd && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3" />
          Computed end date:{" "}
          <span className="font-medium text-foreground">
            {format(computedEnd, "MMM d, yyyy h:mm a")}
          </span>
        </p>
      )}
      <DialogFooter>
        <Button
          type="submit"
          disabled={isSaving || !form.subscriberId || !form.startDate || daysNum < 1}
        >
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Grace Period"}
        </Button>
      </DialogFooter>
    </form>
  );
}
