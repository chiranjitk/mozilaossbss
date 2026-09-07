// =====================================================================
// RECONCILIATION CLIENT — match payments, mark reconciled
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Scale, CheckCircle2, Clock, CircleDollarSign, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReconItem {
  id: string; number: string; amount: number; currency: string;
  method: string; gateway: string | null; gatewayRef: string | null;
  status: string; reconciled: boolean; reconciledAt: string | null;
  notes: string | null; receivedAt: string;
  subscriber: { customerId: string; name: string } | null;
  invoice: { number: string; total: number; amountPaid: number } | null;
}

const formatCurrency = (n: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

async function fetchRecon(params: { page: number; pageSize: number; filter: string }): Promise<{ data: ReconItem[]; total: number }> {
  const url = new URL("/api/v1/reconciliation", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.filter) url.searchParams.set("filter", params.filter);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

export function ReconciliationClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filter, setFilter] = useState("unreconciled");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reconciliation", { page, pageSize, filter }],
    queryFn: () => fetchRecon({ page, pageSize, filter }),
    placeholderData: (prev) => prev,
  });

  const reconcileMutation = useMutation({
    mutationFn: async ({ action, paymentIds }: { action: "reconcile" | "unreconcile"; paymentIds: string[] }) => {
      const res = await fetch("/api/v1/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, paymentIds }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["reconciliation"] }); queryClient.invalidateQueries({ queryKey: ["payments"] }); toast.success("Reconciliation updated"); setSelected(new Set()); },
    onError: () => toast.error("Failed"),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleAll = () => {
    if (!data) return;
    if (selected.size === data.data.length) setSelected(new Set());
    else setSelected(new Set(data.data.map((d) => d.id)));
  };

  const columns = useMemo<ColumnDef<ReconItem>[]>(() => [
    {
      id: "select",
      header: () => <Checkbox checked={data?.data.length > 0 && selected.size === data.data.length} onCheckedChange={toggleAll} />,
      cell: ({ row }) => <Checkbox checked={selected.has(row.original.id)} onCheckedChange={() => toggleSelect(row.original.id)} />,
    },
    { id: "number", header: "Payment #", cell: ({ row }) => <code className="text-xs font-mono text-brand">{row.original.number}</code> },
    { id: "amount", header: "Amount", cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.original.amount, row.original.currency)}</span> },
    { id: "method", header: "Method", cell: ({ row }) => <Badge variant="outline" className="text-[10px] capitalize">{row.original.method}</Badge> },
    { id: "subscriber", header: "Subscriber", cell: ({ row }) => row.original.subscriber ? <div className="text-xs"><p className="font-medium">{row.original.subscriber.name}</p><code className="text-muted-foreground font-mono">{row.original.subscriber.customerId}</code></div> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "invoice", header: "Invoice", cell: ({ row }) => row.original.invoice ? <div className="text-xs"><code className="font-mono">{row.original.invoice.number}</code><p className="text-muted-foreground">Paid: {formatCurrency(row.original.invoice.amountPaid)} / {formatCurrency(row.original.invoice.total)}</p></div> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "reconciled", header: "Status", cell: ({ row }) => row.original.reconciled ? <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Reconciled</span> : <span className="flex items-center gap-1 text-xs text-warning"><Clock className="h-3.5 w-3.5" /> Pending</span> },
    { id: "received", header: "Received", cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(row.original.receivedAt), { addSuffix: true })}</span> },
  ], [selected, data, toggleAll]);

  return (
    <>
      <PageHeader title="Reconciliation" description="Match payments to invoices and reconcile transactions. Select payments and mark them as reconciled." />

      {/* Stats */}
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Scale className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><Clock className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((p) => !p.reconciled).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unreconciled</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((p) => p.reconciled).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reconciled</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info"><CircleDollarSign className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{formatCurrency(data.data.filter((p) => !p.reconciled).reduce((s, p) => s + p.amount, 0))}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending Amount</p></div></div></Card>
        </div>
      )}

      {/* Filter + action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); setSelected(new Set()); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="unreconciled">Unreconciled</SelectItem><SelectItem value="reconciled">Reconciled</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button size="sm" variant="default" disabled={reconcileMutation.isPending} onClick={() => reconcileMutation.mutate({ action: filter === "reconciled" ? "unreconcile" : "reconcile", paymentIds: Array.from(selected) })}>
              {reconcileMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {filter === "reconciled" ? "Mark Unreconciled" : "Mark Reconciled"}
            </Button>
          </div>
        )}
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} emptyMessage="No payments to reconcile" emptyDescription="All payments are reconciled or none exist yet." />
    </>
  );
}
