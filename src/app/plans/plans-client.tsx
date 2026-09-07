// =====================================================================
// PLANS CLIENT — list, create, edit, delete plans with full config
// Shows pricing, bandwidth, data caps, session limits, subscriber counts
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Gauge,
  Zap,
  Calendar,
  Users,
  Loader2,
  Infinity as InfinityIcon,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price: number;
  currency: string;
  billingCycle: string;
  downloadSpeed: number | null; // kbps
  uploadSpeed: number | null; // kbps
  dataCap: number | null; // MB, null = unlimited
  sessionLimit: number;
  taxRate: number;
  status: string;
  subscriberCount: number;
  createdAt?: string;
}

async function fetchPlans(): Promise<Plan[]> {
  const res = await fetch("/api/v1/plans", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load plans");
  const json = await res.json();
  return json.data.plans;
}

async function savePlan(data: Partial<Plan> & { name: string; code: string; price: number }): Promise<void> {
  const isEdit = !!data.id;
  const res = await fetch(isEdit ? `/api/v1/plans/${data.id}` : "/api/v1/plans", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save plan");
  }
}

async function deletePlan(id: string): Promise<void> {
  const res = await fetch(`/api/v1/plans/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete plan");
  }
}

// Helpers
const formatSpeed = (kbps: number | null): string => {
  if (kbps === null || kbps === 0) return "—";
  if (kbps >= 1000000) return `${(kbps / 1000000).toFixed(1)} Gbps`;
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`;
  return `${kbps} Kbps`;
};

const formatDataCap = (mb: number | null): string => {
  if (mb === null || mb === 0) return "Unlimited";
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
};

const formatCurrency = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const BILLING_CYCLE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  weekly: "Weekly",
  one_time: "One-time",
};

export function PlansClient() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const { data: plans, isLoading, isError, refetch } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: fetchPlans,
  });

  const saveMutation = useMutation({
    mutationFn: savePlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plan saved");
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Plan deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Plans" description="Service plans with bandwidth, data, and session limits." />
        <LoadingState label="Loading plans…" />
      </>
    );
  }

  if (isError || !plans) {
    return (
      <>
        <PageHeader title="Plans" description="Service plans with bandwidth, data, and session limits." />
        <ErrorState onRetry={() => refetch()} />
      </>
    );
  }

  const activePlans = plans.filter((p) => p.status === "active");
  const totalSubscribers = plans.reduce((sum, p) => sum + p.subscriberCount, 0);

  return (
    <>
      <PageHeader
        title="Plans"
        description="Service plans with bandwidth, data, and session limits. Changes affect new invoices only."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Plan
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <StatTile label="Total Plans" value={plans.length} icon={Package} accent="brand" />
        <StatTile label="Active" value={activePlans.length} icon={Package} accent="success" />
        <StatTile label="Disabled" value={plans.length - activePlans.length} icon={Package} accent="muted" />
        <StatTile label="Subscribers" value={totalSubscribers} icon={Users} accent="warning" />
      </div>

      {/* Plan grid */}
      {plans.length === 0 ? (
        <EmptyState
          title="No plans yet"
          description="Create your first service plan to start provisioning subscribers."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" /> New Plan
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => setEditing(plan)}
              onDelete={() => setDeleteTarget(plan)}
            />
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit plan: ${editing.name}` : "Create new plan"}
            </DialogTitle>
            <DialogDescription>
              Configure pricing, bandwidth limits, data caps, and session limits for this plan.
            </DialogDescription>
          </DialogHeader>
          <PlanForm
            plan={editing}
            isSaving={saveMutation.isPending}
            onSave={(values) => saveMutation.mutate({ ...values, id: editing?.id })}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span> plan.
              {deleteTarget && deleteTarget.subscriberCount > 0 ? (
                <span className="block mt-2 text-warning">
                  ⚠ {deleteTarget.subscriberCount} subscriber(s) are on this plan. Reassign them first.
                </span>
              ) : (
                " This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || (deleteTarget?.subscriberCount ?? 0) > 0}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------
// PLAN CARD
// ---------------------------------------------------------------------

function PlanCard({
  plan,
  onEdit,
  onDelete,
}: {
  plan: Plan;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={cn("flex flex-col", plan.status === "active" && "ring-1 ring-brand/20")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                plan.status === "active" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
              )}
            >
              <Package className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold truncate">{plan.name}</h3>
              <code className="text-xs font-mono text-muted-foreground">{plan.code}</code>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pt-0">
        {plan.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{plan.description}</p>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-brand">
            {formatCurrency(plan.price, plan.currency)}
          </span>
          <span className="text-xs text-muted-foreground">
            / {BILLING_CYCLE_LABELS[plan.billingCycle] ?? plan.billingCycle}
          </span>
        </div>

        {/* Specs grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <SpecRow
            icon={Gauge}
            label="Down"
            value={formatSpeed(plan.downloadSpeed)}
          />
          <SpecRow
            icon={Zap}
            label="Up"
            value={formatSpeed(plan.uploadSpeed)}
          />
          <SpecRow
            icon={HardDrive}
            label="Data"
            value={formatDataCap(plan.dataCap)}
            valueIcon={plan.dataCap === null || plan.dataCap === 0 ? <InfinityIcon className="h-3 w-3" /> : undefined}
          />
          <SpecRow
            icon={Users}
            label="Sessions"
            value={String(plan.sessionLimit)}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <StatusBadge status={plan.status} />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            {plan.subscriberCount} subscriber{plan.subscriberCount !== 1 ? "s" : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function SpecRow({
  icon: Icon,
  label,
  value,
  valueIcon,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  valueIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium flex items-center gap-1">
        {value}
        {valueIcon}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------
// PLAN FORM
// ---------------------------------------------------------------------

function PlanForm({
  plan,
  isSaving,
  onSave,
}: {
  plan: Plan | null;
  isSaving: boolean;
  onSave: (values: any) => void;
}) {
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    code: plan?.code ?? "",
    description: plan?.description ?? "",
    price: plan?.price ?? 0,
    currency: plan?.currency ?? "USD",
    billingCycle: plan?.billingCycle ?? "monthly",
    downloadSpeed: plan?.downloadSpeed ?? 0,
    uploadSpeed: plan?.uploadSpeed ?? 0,
    dataCap: plan?.dataCap ?? 0,
    sessionLimit: plan?.sessionLimit ?? 1,
    taxRate: plan?.taxRate ?? 0,
    status: plan?.status ?? "active",
  });

  const handleChange = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...form,
          downloadSpeed: Number(form.downloadSpeed) || null,
          uploadSpeed: Number(form.uploadSpeed) || null,
          dataCap: Number(form.dataCap) || null,
          price: Number(form.price),
          taxRate: Number(form.taxRate),
          sessionLimit: Number(form.sessionLimit),
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="plan-name">Name</Label>
          <Input
            id="plan-name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="e.g. Pro 100 Mbps"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-code">Code</Label>
          <Input
            id="plan-code"
            value={form.code}
            onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
            placeholder="e.g. PRO-100MBPS"
            disabled={!!plan}
            required
            className="font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plan-desc">Description</Label>
        <Textarea
          id="plan-desc"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Plan description"
          rows={2}
        />
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="plan-price">Price</Label>
          <Input
            id="plan-price"
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => handleChange("price", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-currency">Currency</Label>
          <select
            id="plan-currency"
            value={form.currency}
            onChange={(e) => handleChange("currency", e.target.value)}
            disabled={!!plan}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="USD">USD ($)</option>
            <option value="INR">INR (₹)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-cycle">Billing Cycle</Label>
          <select
            id="plan-cycle"
            value={form.billingCycle}
            onChange={(e) => handleChange("billingCycle", e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {Object.entries(BILLING_CYCLE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bandwidth */}
      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5" /> Bandwidth Limits (Kbps)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="plan-down" className="text-xs">Download Speed</Label>
            <Input
              id="plan-down"
              type="number"
              min="0"
              value={form.downloadSpeed}
              onChange={(e) => handleChange("downloadSpeed", e.target.value)}
              placeholder="0 = no limit"
            />
            <p className="text-[10px] text-muted-foreground">
              {Number(form.downloadSpeed) >= 1000
                ? `${(Number(form.downloadSpeed) / 1000).toFixed(1)} Mbps`
                : "Enter Kbps (102400 = 100 Mbps)"}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-up" className="text-xs">Upload Speed</Label>
            <Input
              id="plan-up"
              type="number"
              min="0"
              value={form.uploadSpeed}
              onChange={(e) => handleChange("uploadSpeed", e.target.value)}
              placeholder="0 = no limit"
            />
            <p className="text-[10px] text-muted-foreground">
              {Number(form.uploadSpeed) >= 1000
                ? `${(Number(form.uploadSpeed) / 1000).toFixed(1)} Mbps`
                : "Enter Kbps (20480 = 20 Mbps)"}
            </p>
          </div>
        </div>
      </div>

      {/* Data + Sessions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="plan-data">Data Cap (MB)</Label>
          <Input
            id="plan-data"
            type="number"
            min="0"
            value={form.dataCap}
            onChange={(e) => handleChange("dataCap", e.target.value)}
            placeholder="0 = unlimited"
          />
          <p className="text-[10px] text-muted-foreground">
            {Number(form.dataCap) === 0
              ? "Unlimited"
              : Number(form.dataCap) >= 1024
                ? `${(Number(form.dataCap) / 1024).toFixed(0)} GB`
                : `${form.dataCap} MB`}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-sessions">Session Limit</Label>
          <Input
            id="plan-sessions"
            type="number"
            min="1"
            value={form.sessionLimit}
            onChange={(e) => handleChange("sessionLimit", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-tax">Tax Rate</Label>
          <Input
            id="plan-tax"
            type="number"
            step="0.0001"
            min="0"
            max="1"
            value={form.taxRate}
            onChange={(e) => handleChange("taxRate", e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">
            {(Number(form.taxRate) * 100).toFixed(2)}% (0.18 = 18%)
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label htmlFor="plan-status">Status</Label>
        <select
          id="plan-status"
          value={form.status}
          onChange={(e) => handleChange("status", e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name || !form.code}>
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {plan ? "Save changes" : "Create plan"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------
// STAT TILE
// ---------------------------------------------------------------------

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Package;
  accent: "brand" | "success" | "muted" | "warning";
}) {
  const accentClass = {
    brand: "bg-brand/10 text-brand",
    success: "bg-success/10 text-success",
    muted: "bg-muted text-muted-foreground",
    warning: "bg-warning/10 text-warning",
  }[accent];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", accentClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  );
}
