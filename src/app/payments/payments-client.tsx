// =====================================================================
// PAYMENTS CLIENT — list, record manual payment, filter
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { CircleDollarSign, Plus, CreditCard, CheckCircle2, Clock, Loader2, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentItem {
  id: string; number: string; amount: number; currency: string;
  method: string; gateway: string | null; gatewayRef: string | null;
  status: string; reconciled: boolean; notes: string | null; receivedAt: string;
  subscriber: { customerId: string; name: string } | null;
  invoice: { number: string } | null;
}

const formatCurrency = (n: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const METHOD_COLORS: Record<string, string> = {
  cash: "bg-success/10 text-success", card: "bg-brand/10 text-brand",
  bank: "bg-info/10 text-info", upi: "bg-warning/10 text-warning",
  wallet: "bg-muted text-muted-foreground", manual: "bg-muted text-muted-foreground",
  gateway: "bg-brand/10 text-brand",
};

async function fetchPayments(params: { page: number; pageSize: number; search: string; status: string; method: string }): Promise<{ data: PaymentItem[]; total: number }> {
  const url = new URL("/api/v1/payments", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.method && params.method !== "all") url.searchParams.set("method", params.method);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

export function PaymentsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [recordOpen, setRecordOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["payments", { page, pageSize, search, statusFilter, methodFilter }],
    queryFn: () => fetchPayments({ page, pageSize, search, status: statusFilter, method: methodFilter }),
    placeholderData: (prev) => prev,
  });

  const recordMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await fetch("/api/v1/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payments"] }); queryClient.invalidateQueries({ queryKey: ["invoices"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Payment recorded"); setRecordOpen(false); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<PaymentItem>[]>(() => [
    { id: "number", header: "Payment #", cell: ({ row }) => <code className="text-xs font-mono text-brand">{row.original.number}</code> },
    { id: "amount", header: "Amount", cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{formatCurrency(row.original.amount, row.original.currency)}</span> },
    { id: "method", header: "Method", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize", METHOD_COLORS[row.original.method] ?? "bg-muted text-muted-foreground")}>{row.original.method}</span> },
    { id: "subscriber", header: "Subscriber", cell: ({ row }) => row.original.subscriber ? <div className="text-xs"><p className="font-medium">{row.original.subscriber.name}</p><code className="text-muted-foreground font-mono">{row.original.subscriber.customerId}</code></div> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "invoice", header: "Invoice", cell: ({ row }) => row.original.invoice ? <code className="text-xs font-mono text-muted-foreground">{row.original.invoice.number}</code> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "gateway", header: "Gateway", cell: ({ row }) => row.original.gateway ? <Badge variant="outline" className="text-[10px] capitalize">{row.original.gateway}</Badge> : <span className="text-xs text-muted-foreground">—</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "reconciled", header: "Reconciled", cell: ({ row }) => row.original.reconciled ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Clock className="h-4 w-4 text-muted-foreground" /> },
    { id: "received", header: "Received", cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(row.original.receivedAt), { addSuffix: true })}</span> },
  ], []);

  return (
    <>
      <PageHeader title="Payments" description="Record and track payments. Manual payments, gateway transactions, and reconciliation status." actions={<Button size="sm" onClick={() => setRecordOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> Record Payment</Button>} />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><CircleDollarSign className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((p) => p.status === "completed").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Completed</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground"><Clock className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((p) => !p.reconciled).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unreconciled</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><CreditCard className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{formatCurrency(data.data.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0))}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Amount</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="refunded">Refunded</SelectItem></SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm-w-44"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All methods</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="wallet">Wallet</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search by payment #, subscriber, or gateway ref…" emptyMessage="No payments" emptyDescription="Record a payment to start tracking transactions." />

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-brand" /> Record Payment</DialogTitle><DialogDescription>Record a manual payment (cash, bank transfer, etc.).</DialogDescription></DialogHeader>
          <PaymentForm isSaving={recordMutation.isPending} onSave={(values) => recordMutation.mutate(values)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaymentForm({ isSaving, onSave }: { isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({ amount: "", currency: "USD", method: "cash", subscriberId: "", invoiceId: "", notes: "" });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ amount: Number(form.amount), currency: form.currency, method: form.method, subscriberId: form.subscriberId || undefined, invoiceId: form.invoiceId || undefined, notes: form.notes || undefined }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="p-amount">Amount *</Label><Input id="p-amount" type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required placeholder="0.00" /></div>
        <div className="space-y-2"><Label>Currency</Label><Select value={form.currency} onValueChange={(v) => setForm((p) => ({ ...p, currency: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD ($)</SelectItem><SelectItem value="INR">INR (₹)</SelectItem><SelectItem value="EUR">EUR (€)</SelectItem></SelectContent></Select></div>
      </div>
      <div className="space-y-2"><Label>Method</Label><Select value={form.method} onValueChange={(v) => setForm((p) => ({ ...p, method: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="bank">Bank Transfer</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="wallet">Wallet</SelectItem><SelectItem value="manual">Manual / Other</SelectItem></SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="p-sub">Subscriber ID</Label><Input id="p-sub" value={form.subscriberId} onChange={(e) => setForm((p) => ({ ...p, subscriberId: e.target.value }))} placeholder="Optional" /></div>
        <div className="space-y-2"><Label htmlFor="p-inv">Invoice ID</Label><Input id="p-inv" value={form.invoiceId} onChange={(e) => setForm((p) => ({ ...p, invoiceId: e.target.value }))} placeholder="Optional" /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="p-notes">Notes</Label><Textarea id="p-notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional payment notes" /></div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.amount}>{isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Record Payment</Button></DialogFooter>
    </form>
  );
}
