// =====================================================================
// INVOICES CLIENT — list, create, view detail, cancel, apply payment
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { format, formatDistanceToNow, isAfter } from "date-fns";
import {
  ReceiptText,
  Plus,
  Eye,
  Ban,
  DollarSign,
  Clock,
  Loader2,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceItem {
  id: string;
  number: string;
  subscriberId: string | null;
  subscriber: { customerId: string; name: string; planName: string | null } | null;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  currency: string;
  paymentCount: number;
  hasPayments: boolean;
}

interface InvoiceDetail extends InvoiceItem {
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  payments: Array<{ id: string; amount: number; method: string; receivedAt: string }>;
  subscriber: { id: string; customerId: string; name: string; email: string; plan: { name: string; code: string } | null } | null;
}

async function fetchInvoices(params: { page: number; pageSize: number; search: string; status: string }): Promise<{ data: InvoiceItem[]; total: number }> {
  const url = new URL("/api/v1/invoices", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch invoices");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchInvoiceDetail(id: string): Promise<InvoiceDetail> {
  const res = await fetch(`/api/v1/invoices/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch invoice");
  const json = await res.json();
  return json.data;
}

async function applyPayment(id: string, amount: number, method: string): Promise<void> {
  const res = await fetch(`/api/v1/invoices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "apply_payment", paymentAmount: amount, paymentMethod: method }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to apply payment");
  }
}

async function cancelInvoice(id: string): Promise<void> {
  const res = await fetch(`/api/v1/invoices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to cancel invoice");
  }
}

const formatCurrency = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

export function InvoicesClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<InvoiceItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["invoices", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchInvoices({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const { data: invoiceDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["invoice-detail", detailId],
    queryFn: () => fetchInvoiceDetail(detailId!),
    enabled: !!detailId,
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, amount, method }: { id: string; amount: number; method: string }) =>
      applyPayment(id, amount, method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-detail"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Payment applied");
      setPaymentTarget(null);
      setPaymentAmount("");
      refetchDetail();
    },
    onError: (e: Error) => toast.error("Payment failed", { description: e.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice cancelled");
      refetchDetail();
    },
    onError: (e: Error) => toast.error("Cancel failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<InvoiceItem>[]>(
    () => [
      {
        id: "number",
        header: "Invoice #",
        cell: ({ row }) => (
          <button
            onClick={() => setDetailId(row.original.id)}
            className="font-mono text-sm text-brand hover:underline"
          >
            {row.original.number}
          </button>
        ),
      },
      {
        id: "subscriber",
        header: "Subscriber",
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
        id: "issueDate",
        header: "Issued",
        cell: ({ row }) => (
          <div className="text-xs">
            <p>{format(new Date(row.original.issueDate), "MMM d, yyyy")}</p>
            <p className="text-muted-foreground">{formatDistanceToNow(new Date(row.original.issueDate), { addSuffix: true })}</p>
          </div>
        ),
      },
      {
        id: "dueDate",
        header: "Due",
        cell: ({ row }) => {
          const due = new Date(row.original.dueDate);
          const isOverdue = isAfter(new Date(), due) && ["issued", "partial"].includes(row.original.status);
          return (
            <div className={cn("text-xs", isOverdue && "text-destructive")}>
              <p>{format(due, "MMM d, yyyy")}</p>
              {isOverdue && <p className="font-medium">Overdue</p>}
            </div>
          );
        },
      },
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">
            {formatCurrency(row.original.total, row.original.currency)}
          </span>
        ),
      },
      {
        id: "paid",
        header: "Paid",
        cell: ({ row }) => {
          const paid = row.original.amountPaid;
          const total = row.original.total;
          const isPartial = paid > 0 && paid < total;
          const isFull = paid >= total && total > 0;
          return (
            <div className="text-xs tabular-nums">
              <p className={cn(isFull ? "text-success font-medium" : isPartial ? "text-warning" : "text-muted-foreground")}>
                {formatCurrency(paid, row.original.currency)}
              </p>
              <p className="text-muted-foreground">of {formatCurrency(total, row.original.currency)}</p>
            </div>
          );
        },
      },
      {
        id: "balance",
        header: "Balance",
        cell: ({ row }) => (
          <span className={cn("text-sm font-medium tabular-nums", row.original.balanceDue > 0 ? "text-destructive" : "text-success")}>
            {formatCurrency(row.original.balanceDue, row.original.currency)}
          </span>
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
        cell: ({ row }) => {
          const canPay = ["issued", "partial", "overdue"].includes(row.original.status);
          const canCancel = ["issued", "partial", "draft"].includes(row.original.status);
          return (
            <div className="flex items-center gap-1 justify-end">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailId(row.original.id)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              {canPay && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-success hover:text-success"
                  onClick={() => {
                    setPaymentTarget(row.original);
                    setPaymentAmount(String(row.original.balanceDue.toFixed(2)));
                  }}
                >
                  <DollarSign className="mr-1 h-3.5 w-3.5" /> Pay
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Cancel invoice ${row.original.number}?`)) {
                      cancelMutation.mutate(row.original.id);
                    }
                  }}
                >
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [cancelMutation]
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Manage invoices, apply payments, and track outstanding balances."
      />

      {/* Stats */}
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
                <ReceiptText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">{data.total}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Invoices</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.filter((i) => ["issued", "partial", "overdue"].includes(i.status)).length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.filter((i) => i.status === "overdue").length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Overdue</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
                <DollarSign className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {formatCurrency(data.data.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0))}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Collected</p>
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
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
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
        searchPlaceholder="Search by invoice #, subscriber name, or customer ID…"
        emptyMessage="No invoices"
        emptyDescription="Run billing to generate invoices for active subscribers."
      />

      {/* Invoice detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-brand" />
              {invoiceDetail?.number}
            </DialogTitle>
            <DialogDescription>
              {invoiceDetail && `Issued ${format(new Date(invoiceDetail.issueDate), "MMM d, yyyy")} · Due ${format(new Date(invoiceDetail.dueDate), "MMM d, yyyy")}`}
            </DialogDescription>
          </DialogHeader>
          {invoiceDetail && (
            <div className="space-y-4">
              {/* Subscriber + status */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {invoiceDetail.subscriber?.name ?? "No subscriber"}
                  </p>
                  {invoiceDetail.subscriber && (
                    <p className="text-xs text-muted-foreground">
                      {invoiceDetail.subscriber.customerId} · {invoiceDetail.subscriber.email}
                    </p>
                  )}
                  {invoiceDetail.subscriber?.plan && (
                    <Badge variant="outline" className="text-[10px] mt-1">{invoiceDetail.subscriber.plan.name}</Badge>
                  )}
                </div>
                <StatusBadge status={invoiceDetail.status} />
              </div>

              {/* Line items */}
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium py-2 px-3">Description</th>
                      <th className="text-right font-medium py-2 px-3">Qty</th>
                      <th className="text-right font-medium py-2 px-3">Unit Price</th>
                      <th className="text-right font-medium py-2 px-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceDetail.lineItems.map((li, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-2 px-3">{li.description}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{li.quantity}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(li.unitPrice, invoiceDetail.currency)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium">{formatCurrency(li.amount, invoiceDetail.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(invoiceDetail.subtotal, invoiceDetail.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="tabular-nums">{formatCurrency(invoiceDetail.taxAmount, invoiceDetail.currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-border pt-1">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(invoiceDetail.total, invoiceDetail.currency)}</span>
                  </div>
                  <div className="flex justify-between text-success">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="tabular-nums">{formatCurrency(invoiceDetail.amountPaid, invoiceDetail.currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-destructive border-t border-border pt-1">
                    <span>Balance Due</span>
                    <span className="tabular-nums">{formatCurrency(invoiceDetail.balanceDue, invoiceDetail.currency)}</span>
                  </div>
                </div>
              </div>

              {/* Payments */}
              {invoiceDetail.payments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payment History</p>
                  <div className="space-y-1.5">
                    {invoiceDetail.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs">
                        <span className="flex items-center gap-2">
                          <CreditCard className="h-3 w-3 text-muted-foreground" />
                          <span className="capitalize">{p.method}</span>
                          <span className="text-muted-foreground">{format(new Date(p.receivedAt), "MMM d, yyyy HH:mm")}</span>
                        </span>
                        <span className="tabular-nums font-medium text-success">{formatCurrency(p.amount, invoiceDetail.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                {["issued", "partial", "overdue"].includes(invoiceDetail.status) && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setPaymentTarget({
                        id: invoiceDetail.id,
                        number: invoiceDetail.number,
                        balanceDue: invoiceDetail.balanceDue,
                        currency: invoiceDetail.currency,
                      } as InvoiceItem);
                      setPaymentAmount(String(invoiceDetail.balanceDue.toFixed(2)));
                    }}
                  >
                    <DollarSign className="mr-2 h-3.5 w-3.5" /> Apply Payment
                  </Button>
                )}
                {["issued", "partial", "draft"].includes(invoiceDetail.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Cancel invoice ${invoiceDetail.number}?`)) {
                        cancelMutation.mutate(invoiceDetail.id);
                      }
                    }}
                  >
                    <Ban className="mr-2 h-3.5 w-3.5" /> Cancel Invoice
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Apply payment dialog */}
      <Dialog open={!!paymentTarget} onOpenChange={(o) => !o && setPaymentTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-success" /> Apply Payment
            </DialogTitle>
            <DialogDescription>
              Record a payment for invoice{" "}
              <span className="font-medium text-foreground">{paymentTarget?.number}</span>.
              Balance due: {paymentTarget ? formatCurrency(paymentTarget.balanceDue, paymentTarget.currency) : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="pay-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="wallet">Wallet</SelectItem>
                  <SelectItem value="manual">Manual / Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>Cancel</Button>
            <Button
              disabled={paymentMutation.isPending || !paymentAmount || Number(paymentAmount) <= 0}
              onClick={() => {
                if (paymentTarget) {
                  paymentMutation.mutate({
                    id: paymentTarget.id,
                    amount: Number(paymentAmount),
                    method: paymentMethod,
                  });
                }
              }}
            >
              {paymentMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Apply Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
