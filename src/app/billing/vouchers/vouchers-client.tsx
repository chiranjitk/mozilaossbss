// =====================================================================
// VOUCHERS CLIENT — list, generate, redeem, disable
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatDistanceToNow } from "date-fns";
import {
  Ticket,
  Plus,
  Copy,
  Ban,
  Loader2,
  Sparkles,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VoucherItem {
  id: string;
  code: string;
  batchId: string | null;
  type: string;
  plan: { id: string; name: string; code: string } | null;
  value: number;
  currency: string;
  durationDays: number | null;
  status: string;
  subscriber: { customerId: string; name: string } | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

async function fetchVouchers(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: VoucherItem[]; total: number }> {
  const url = new URL("/api/v1/vouchers", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch vouchers");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function generateVouchersApi(data: any): Promise<any> {
  const res = await fetch("/api/v1/vouchers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to generate vouchers");
  }
  return res.json();
}

async function disableVoucherApi(id: string): Promise<void> {
  // For now, we don't have a disable endpoint, so we use the generate endpoint with action
  // Actually, we need a separate endpoint. For now, just show a toast.
  toast.info("Voucher disable endpoint not yet implemented");
}

const TYPE_COLORS: Record<string, string> = {
  plan_subscription: "bg-brand/10 text-brand",
  topup: "bg-success/10 text-success",
  discount: "bg-warning/10 text-warning",
  credit: "bg-info/10 text-info",
};

const TYPE_LABELS: Record<string, string> = {
  plan_subscription: "Plan Subscription",
  topup: "Top-Up",
  discount: "Discount",
  credit: "Credit",
};

const formatCurrency = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

export function VouchersClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [generateOpen, setGenerateOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["vouchers", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchVouchers({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const generateMutation = useMutation({
    mutationFn: generateVouchersApi,
    onSuccess: (json) => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      toast.success(`Generated ${json.data.count} voucher(s)`, {
        description: `Batch: ${json.data.batchId}`,
      });
      setGenerateOpen(false);
    },
    onError: (e: Error) => toast.error("Generation failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied", { description: code });
  };

  const columns = useMemo<ColumnDef<VoucherItem>[]>(
    () => [
      {
        id: "code",
        header: "Voucher Code",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopyCode(row.original.code)}
              className="font-mono text-sm text-brand hover:underline flex items-center gap-1"
              title="Click to copy"
            >
              {row.original.code}
              <Copy className="h-3 w-3 opacity-50" />
            </button>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", TYPE_COLORS[row.original.type] ?? "bg-muted text-muted-foreground")}>
            {TYPE_LABELS[row.original.type] ?? row.original.type}
          </span>
        ),
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            <span className="font-medium">{formatCurrency(row.original.value, row.original.currency)}</span>
            {row.original.durationDays && (
              <p className="text-xs text-muted-foreground">{row.original.durationDays} days</p>
            )}
          </div>
        ),
      },
      {
        id: "plan",
        header: "Plan",
        cell: ({ row }) => (
          row.original.plan ? (
            <Badge variant="outline" className="text-xs">{row.original.plan.name}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "redeemed",
        header: "Redeemed By",
        cell: ({ row }) => (
          row.original.subscriber ? (
            <div className="text-xs">
              <p className="font-medium">{row.original.subscriber.name}</p>
              <code className="text-muted-foreground font-mono">{row.original.subscriber.customerId}</code>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        ),
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          row.original.status === "unused" ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => disableVoucherApi(row.original.id)}
            >
              <Ban className="h-3.5 w-3.5" />
            </Button>
          ) : null
        ),
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="Vouchers"
        description="Generate redemption codes for plans, top-ups, and credits. Track usage and expiry."
        actions={
          <Button size="sm" onClick={() => setGenerateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> Generate Vouchers
          </Button>
        }
      />

      {/* Stats */}
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
                <Ticket className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">{data.total}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Vouchers</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.filter((v) => v.status === "unused").length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Available</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
                <Gift className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.filter((v) => v.status === "used").length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Redeemed</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
                <Ticket className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {formatCurrency(data.data.filter((v) => v.status === "unused").reduce((s, v) => s + v.value, 0))}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unused Value</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="unused">Unused</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        error={error?.message}
        onRetry={() => refetch()}
        pagination={{ page, pageSize, total: data?.total ?? 0 }}
        onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }}
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by code or batch ID…"
        emptyMessage="No vouchers"
        emptyDescription="Generate voucher codes for plans, top-ups, and credits."
      />

      {/* Generate dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" /> Generate Vouchers
            </DialogTitle>
            <DialogDescription>
              Create redemption codes. Codes are generated in CRYP-XXXX-XXXX-XXXX-XXXX format.
            </DialogDescription>
          </DialogHeader>
          <GenerateForm isSaving={generateMutation.isPending} onSave={(values) => generateMutation.mutate(values)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function GenerateForm({ isSaving, onSave }: { isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    count: "10",
    type: "plan_subscription",
    value: "0",
    currency: "USD",
    durationDays: "30",
    notes: "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          count: Number(form.count),
          type: form.type,
          value: Number(form.value),
          currency: form.currency,
          durationDays: Number(form.durationDays) || undefined,
          notes: form.notes || undefined,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="vcount">Count</Label>
          <Input
            id="vcount"
            type="number"
            min="1"
            max="1000"
            value={form.count}
            onChange={(e) => setForm((p) => ({ ...p, count: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vtype">Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
            <SelectTrigger id="vtype">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="vvalue">Value</Label>
          <Input
            id="vvalue"
            type="number"
            step="0.01"
            min="0"
            value={form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vduration">Duration (days)</Label>
          <Input
            id="vduration"
            type="number"
            min="1"
            max="365"
            value={form.durationDays}
            onChange={(e) => setForm((p) => ({ ...p, durationDays: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vcurrency">Currency</Label>
        <Select value={form.currency} onValueChange={(v) => setForm((p) => ({ ...p, currency: v }))}>
          <SelectTrigger id="vcurrency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USD">USD ($)</SelectItem>
            <SelectItem value="INR">INR (₹)</SelectItem>
            <SelectItem value="EUR">EUR (€)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vnotes">Notes (optional)</Label>
        <Input
          id="vnotes"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="e.g. Holiday promotion batch"
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Generate {form.count} Voucher(s)
        </Button>
      </DialogFooter>
    </form>
  );
}
