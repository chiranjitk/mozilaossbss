// =====================================================================
// REFERRALS CLIENT — manage subscriber referral codes & rewards
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
import { format, formatDistanceToNow } from "date-fns";
import {
  Gift,
  Plus,
  Edit,
  Trash2,
  User,
  Copy,
  CheckCircle2,
  Clock,
  ArrowRight,
  DollarSign,
  Percent,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriberMini {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
}

interface ReferralItem {
  id: string;
  referrerId: string | null;
  refereeId: string | null;
  code: string;
  rewardType: "credit" | "discount" | "free_month";
  rewardValue: number;
  status: "pending" | "completed" | "expired";
  completedAt: string | null;
  createdAt: string;
  referrer?: SubscriberMini | null;
  referee?: SubscriberMini | null;
}

interface ReferralFormValues {
  referrerId?: string | null;
  refereeId?: string | null;
  code: string;
  rewardType: "credit" | "discount" | "free_month";
  rewardValue: number;
  status: "pending" | "completed" | "expired";
}

const REWARD_TYPES = [
  { value: "credit", label: "Account Credit ($)", icon: DollarSign, unit: "$" },
  { value: "discount", label: "Discount (%)", icon: Percent, unit: "%" },
  { value: "free_month", label: "Free Month (days)", icon: CalendarDays, unit: "days" },
];

const REWARD_COLORS: Record<string, string> = {
  credit: "bg-success/10 text-success",
  discount: "bg-brand/10 text-brand",
  free_month: "bg-info/10 text-info",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);

async function fetchReferrals(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  rewardType: string;
}): Promise<{ data: ReferralItem[]; total: number }> {
  const url = new URL("/api/v1/referrals", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.rewardType && params.rewardType !== "all")
    url.searchParams.set("rewardType", params.rewardType);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch referrals");
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

async function saveReferral(values: ReferralFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/referrals/${values.id}` : "/api/v1/referrals",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save referral");
  }
}

async function deleteReferral(id: string): Promise<void> {
  const res = await fetch(`/api/v1/referrals/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete referral");
  }
}

export function ReferralsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReferralItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReferralItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["referrals", { page, pageSize, search, statusFilter, typeFilter }],
    queryFn: () =>
      fetchReferrals({
        page,
        pageSize,
        search,
        status: statusFilter,
        rewardType: typeFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: ReferralFormValues & { id?: string }) => saveReferral(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      toast.success("Referral saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReferral(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
      toast.success("Referral deleted");
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
    toast.success("Referral code copied", { description: code });
  };

  const columns = useMemo<ColumnDef<ReferralItem>[]>(
    () => [
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
        id: "referrer",
        header: "Referrer → Referee",
        cell: ({ row }) => {
          const ref = row.original.referrer;
          const ee = row.original.referee;
          return (
            <div className="flex items-center gap-2 max-w-xs">
              <div className="flex flex-col min-w-0">
                {ref ? (
                  <>
                    <span className="text-xs font-medium truncate">
                      {ref.firstName} {ref.lastName}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {ref.customerId}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex flex-col min-w-0">
                {ee ? (
                  <>
                    <span className="text-xs font-medium truncate">
                      {ee.firstName} {ee.lastName}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {ee.customerId}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">pending</span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "reward",
        header: "Reward",
        cell: ({ row }) => {
          const cfg = REWARD_TYPES.find((t) => t.value === row.original.rewardType);
          const Icon = cfg?.icon ?? Gift;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium",
                REWARD_COLORS[row.original.rewardType] ?? "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-3 w-3" />
              {row.original.rewardValue}
              {cfg?.unit && <span className="opacity-70">{cfg.unit}</span>}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "completedAt",
        header: "Completed",
        cell: ({ row }) => {
          if (!row.original.completedAt) {
            return (
              <span className="text-xs text-muted-foreground">
                Created {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
              </span>
            );
          }
          return (
            <span className="text-xs tabular-nums">
              {format(new Date(row.original.completedAt), "MMM d, yyyy")}
            </span>
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
              aria-label="Edit referral"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete referral"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const referrals = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const completedCount = referrals.filter((r) => r.status === "completed").length;
  const pendingCount = referrals.filter((r) => r.status === "pending").length;
  const totalRewardValue = referrals
    .filter((r) => r.status === "completed" && r.rewardType === "credit")
    .reduce((sum, r) => sum + r.rewardValue, 0);

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Manage subscriber referral codes and reward distribution (credit, discount, or free month)."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Referral
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Gift className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Referrals
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
              <p className="text-xl font-semibold tabular-nums">{completedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Completed
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{pendingCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Pending
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <DollarSign className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {formatCurrency(totalRewardValue)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Credit Issued
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
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
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
          <SelectTrigger className="h-9 w-full sm:w-48">
            <SelectValue placeholder="Reward Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reward types</SelectItem>
            {REWARD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={referrals}
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
        searchPlaceholder="Search by referral code…"
        emptyMessage="No referrals"
        emptyDescription="Create a referral code to reward subscribers for inviting friends."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-brand" /> New Referral Code
            </DialogTitle>
            <DialogDescription>
              Referral codes can be assigned to a specific referrer, or left open for any subscriber
              to share.
            </DialogDescription>
          </DialogHeader>
          <ReferralForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Referral
            </DialogTitle>
            <DialogDescription>
              Update code <code className="font-mono text-xs">{editTarget?.code}</code>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <ReferralForm
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
            <AlertDialogTitle>Delete referral?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            This will permanently delete the referral code{" "}
            <code className="font-mono">{deleteTarget?.code}</code>. Any pending rewards will be lost.
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

function ReferralForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: ReferralItem;
  isSaving: boolean;
  onSave: (values: ReferralFormValues) => void;
}) {
  const { data: subscribers, isLoading: subsLoading } = useQuery({
    queryKey: ["subscribers-mini"],
    queryFn: fetchSubscribers,
    staleTime: 60_000,
  });

  const generateCode = () => {
    const adj = ["SUMMER", "WINTER", "SPRING", "FALL", "VIP", "FRIEND"];
    const a = adj[Math.floor(Math.random() * adj.length)];
    const n = Math.floor(Math.random() * 9000) + 1000;
    return `${a}${n}`;
  };

  const [form, setForm] = useState<{
    referrerId: string;
    refereeId: string;
    code: string;
    rewardType: ReferralFormValues["rewardType"];
    rewardValue: string;
    status: ReferralFormValues["status"];
  }>({
    referrerId: initial?.referrerId ?? "",
    refereeId: initial?.refereeId ?? "",
    code: initial?.code ?? generateCode(),
    rewardType: (initial?.rewardType as ReferralFormValues["rewardType"]) ?? "credit",
    rewardValue: initial?.rewardValue?.toString() ?? "10",
    status: (initial?.status as ReferralFormValues["status"]) ?? "pending",
  });

  const valueNum = form.rewardValue ? parseFloat(form.rewardValue) : 0;
  const cfg = REWARD_TYPES.find((t) => t.value === form.rewardType);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          referrerId: form.referrerId || null,
          refereeId: form.refereeId || null,
          code: form.code,
          rewardType: form.rewardType,
          rewardValue: valueNum,
          status: form.status,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="rf-code">Referral Code *</Label>
        <div className="flex gap-2">
          <Input
            id="rf-code"
            value={form.code}
            onChange={(e) =>
              setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))
            }
            placeholder="SUMMER25"
            className="font-mono flex-1"
            required
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setForm((p) => ({ ...p, code: generateCode() }))}
          >
            Generate
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="rf-ref">Referrer (optional)</Label>
          <Select
            value={form.referrerId}
            onValueChange={(v) => setForm((p) => ({ ...p, referrerId: v === "__none__" ? "" : v }))}
          >
            <SelectTrigger id="rf-ref">
              <SelectValue placeholder={subsLoading ? "Loading…" : "Select referrer"} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="__none__">— Any subscriber —</SelectItem>
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
        <div className="space-y-2">
          <Label htmlFor="rf-ree">Referee (optional)</Label>
          <Select
            value={form.refereeId}
            onValueChange={(v) => setForm((p) => ({ ...p, refereeId: v === "__none__" ? "" : v }))}
          >
            <SelectTrigger id="rf-ree">
              <SelectValue placeholder={subsLoading ? "Loading…" : "Select referee"} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="__none__">— Pending referral —</SelectItem>
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
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Reward Type</Label>
          <Select
            value={form.rewardType}
            onValueChange={(v: ReferralFormValues["rewardType"]) =>
              setForm((p) => ({ ...p, rewardType: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REWARD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rf-val">Reward Value *</Label>
          <div className="relative">
            <Input
              id="rf-val"
              type="number"
              min="0"
              step="any"
              value={form.rewardValue}
              onChange={(e) => setForm((p) => ({ ...p, rewardValue: e.target.value }))}
              className={form.rewardType !== "free_month" ? "pl-7" : "pr-9"}
              required
            />
            {form.rewardType === "credit" && (
              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            )}
            {form.rewardType === "discount" && (
              <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
      {cfg && valueNum > 0 && (
        <p className="text-xs text-muted-foreground">
          Reward on completion:{" "}
          <span className="font-medium text-foreground">
            {form.rewardType === "credit"
              ? formatCurrency(valueNum)
              : form.rewardType === "discount"
              ? `${valueNum}% off`
              : `${valueNum} day${valueNum === 1 ? "" : "s"} free`}
          </span>
        </p>
      )}
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={form.status}
          onValueChange={(v: ReferralFormValues["status"]) =>
            setForm((p) => ({ ...p, status: v }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.code || valueNum < 0}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Referral"}
        </Button>
      </DialogFooter>
    </form>
  );
}
