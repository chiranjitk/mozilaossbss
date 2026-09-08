// =====================================================================
// LOYALTY CLIENT — manage loyalty tier, points per subscriber
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
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
import { format } from "date-fns";
import {
  Award,
  Edit,
  Medal,
  Crown,
  Star,
  Coins,
  TrendingUp,
  Sparkles,
  Plus,
  Gem,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriberMini {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
}

interface LoyaltyItem {
  id: string;
  subscriberId: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  points: number;
  totalEarned: number;
  totalRedeemed: number;
  joinedAt: string;
  updatedAt: string;
  subscriber?: SubscriberMini | null;
}

interface LoyaltyFormValues {
  tier: "bronze" | "silver" | "gold" | "platinum";
  points: number;
  totalRedeemed: number;
}

const TIERS = [
  { value: "bronze", label: "Bronze", icon: Medal, color: "bg-amber-700/10 text-amber-700", threshold: 0 },
  { value: "silver", label: "Silver", icon: Award, color: "bg-slate-400/10 text-slate-600", threshold: 500 },
  { value: "gold", label: "Gold", icon: Crown, color: "bg-warning/10 text-warning", threshold: 2000 },
  { value: "platinum", label: "Platinum", icon: Gem, color: "bg-brand/10 text-brand", threshold: 5000 },
];

const tierConfig = (tier: string) =>
  TIERS.find((t) => t.value === tier) ?? TIERS[0];

async function fetchLoyalty(params: {
  page: number;
  pageSize: number;
  search: string;
  tier: string;
}): Promise<{ data: LoyaltyItem[]; total: number }> {
  const url = new URL("/api/v1/loyalty", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.tier && params.tier !== "all") url.searchParams.set("tier", params.tier);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch loyalty members");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function patchLoyalty(id: string, values: LoyaltyFormValues): Promise<void> {
  const res = await fetch(`/api/v1/loyalty/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to update loyalty member");
  }
}

export function LoyaltyClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [editTarget, setEditTarget] = useState<LoyaltyItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["loyalty", { page, pageSize, search, tierFilter }],
    queryFn: () =>
      fetchLoyalty({
        page,
        pageSize,
        search,
        tier: tierFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: LoyaltyFormValues }) =>
      patchLoyalty(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty"] });
      toast.success("Loyalty member updated");
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Update failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<LoyaltyItem>[]>(
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
        id: "tier",
        header: "Tier",
        cell: ({ row }) => {
          const cfg = tierConfig(row.original.tier);
          const Icon = cfg.icon;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium",
                cfg.color
              )}
            >
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
          );
        },
      },
      {
        id: "points",
        header: "Current Points",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums font-medium flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-brand" />
            {row.original.points.toLocaleString()}
          </span>
        ),
      },
      {
        id: "totalEarned",
        header: "Total Earned",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums flex items-center gap-1">
            <Coins className="h-3 w-3 text-success" />
            {row.original.totalEarned.toLocaleString()}
          </span>
        ),
      },
      {
        id: "totalRedeemed",
        header: "Redeemed",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {row.original.totalRedeemed.toLocaleString()}
          </span>
        ),
      },
      {
        id: "joinedAt",
        header: "Joined",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {format(new Date(row.original.joinedAt), "MMM d, yyyy")}
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
              aria-label="Edit loyalty member"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const members = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const tierCounts = TIERS.map((t) => ({
    ...t,
    count: members.filter((m) => m.tier === t.value).length,
  }));
  const totalPointsInPage = members.reduce((sum, m) => sum + m.points, 0);

  return (
    <>
      <PageHeader
        title="Loyalty Program"
        description="Track subscriber loyalty across tiers — bronze, silver, gold, and platinum — with points earned, redeemed, and history."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Members
              </p>
            </div>
          </div>
        </Card>
        {tierCounts
          .filter((t) => ["gold", "platinum", "silver"].includes(t.value))
          .map((t) => {
            const Icon = t.icon;
            return (
              <Card key={t.value} className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", t.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{t.count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.label} Tier
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
      </div>

      {/* Tier breakdown bar */}
      <Card className="p-4 mb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Tier distribution (current page)</p>
            <p className="text-xs text-muted-foreground">
              Points in flight on this page:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {totalPointsInPage.toLocaleString()}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tierCounts.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.value}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium",
                    t.color
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}: {t.count}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select
          value={tierFilter}
          onValueChange={(v) => {
            setTierFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {TIERS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={members}
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
        emptyMessage="No loyalty members"
        emptyDescription="Loyalty members are created when a subscriber earns their first points."
      />

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
              <Edit className="h-5 w-5 text-brand" /> Edit Loyalty Member
            </DialogTitle>
            <DialogDescription>
              Manually adjust tier and points for{" "}
              {editTarget?.subscriber
                ? `${editTarget.subscriber.firstName} ${editTarget.subscriber.lastName}`
                : "subscriber"}
              . Increasing points will also bump total earned.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <LoyaltyForm
              key={editTarget.id}
              initial={editTarget}
              isSaving={saveMutation.isPending}
              onSave={(values) =>
                saveMutation.mutate({ id: editTarget.id, values })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------
// FORM — edit tier, points, redeemed
// ---------------------------------------------------------------------

function LoyaltyForm({
  initial,
  isSaving,
  onSave,
}: {
  initial: LoyaltyItem;
  isSaving: boolean;
  onSave: (values: LoyaltyFormValues) => void;
}) {
  const [form, setForm] = useState<{
    tier: LoyaltyFormValues["tier"];
    points: string;
    totalRedeemed: string;
  }>({
    tier: initial.tier,
    points: initial.points.toString(),
    totalRedeemed: initial.totalRedeemed.toString(),
  });

  const pointsNum = form.points ? parseInt(form.points, 10) : 0;
  const redeemedNum = form.totalRedeemed ? parseInt(form.totalRedeemed, 10) : 0;
  const pointsDelta = pointsNum - initial.points;
  const newTotalEarned = initial.totalEarned + (pointsDelta > 0 ? pointsDelta : 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          tier: form.tier,
          points: pointsNum,
          totalRedeemed: redeemedNum,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Tier</Label>
          <Select
            value={form.tier}
            onValueChange={(v: LoyaltyFormValues["tier"]) => setForm((p) => ({ ...p, tier: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label} (≥ {t.threshold.toLocaleString()} pts)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lm-points">Current Points *</Label>
          <Input
            id="lm-points"
            type="number"
            min="0"
            step="1"
            value={form.points}
            onChange={(e) => setForm((p) => ({ ...p, points: e.target.value }))}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="lm-redeemed">Total Redeemed</Label>
          <Input
            id="lm-redeemed"
            type="number"
            min="0"
            step="1"
            value={form.totalRedeemed}
            onChange={(e) => setForm((p) => ({ ...p, totalRedeemed: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Total Earned (computed)</Label>
          <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/40 text-sm tabular-nums">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
            {newTotalEarned.toLocaleString()}
          </div>
        </div>
      </div>
      {pointsDelta > 0 && (
        <p className="text-xs text-success flex items-center gap-1">
          <Plus className="h-3 w-3" />
          Adding {pointsDelta.toLocaleString()} points will increase total earned by the same amount.
        </p>
      )}
      {pointsDelta < 0 && (
        <p className="text-xs text-warning flex items-center gap-1">
          <Star className="h-3 w-3" />
          Removing {Math.abs(pointsDelta).toLocaleString()} points (total earned unchanged).
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSaving || pointsNum < 0 || redeemedNum < 0}>
          {isSaving ? "Saving…" : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
