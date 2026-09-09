// =====================================================================
// CREDIT NOTES CLIENT — list & issue credit notes against invoices
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
import { format } from "date-fns";
import {
  FileMinus,
  Plus,
  DollarSign,
  FileText,
  CheckCircle2,
  XCircle,
  Receipt,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriberMini {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
}

interface InvoiceMini {
  id: string;
  number: string;
  subscriberId: string | null;
  total: number;
  status: string;
  subscriber?: SubscriberMini | null;
}

interface CreditNoteItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  number: string;
  amount: number;
  reason: string | null;
  status: "issued" | "applied" | "cancelled";
  issuedBy: string | null;
  issuedAt: string;
  createdAt: string;
  subscriber?: SubscriberMini | null;
}

interface CreditNoteFormValues {
  invoiceId: string;
  number: string;
  amount: number;
  reason?: string;
  status: "issued" | "applied" | "cancelled";
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);

async function fetchCreditNotes(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: CreditNoteItem[]; total: number }> {
  const url = new URL("/api/v1/credit-notes", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch credit notes");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchInvoices(): Promise<InvoiceMini[]> {
  const url = new URL("/api/v1/invoices", window.location.origin);
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch invoices");
  const json = await res.json();
  return json.data.map((i: any) => ({
    id: i.id,
    number: i.number,
    subscriberId: i.subscriberId,
    total: Number(i.total ?? 0),
    status: i.status,
    subscriber: i.subscriber ?? null,
  }));
}

async function saveCreditNote(values: CreditNoteFormValues): Promise<void> {
  const res = await fetch("/api/v1/credit-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to issue credit note");
  }
}

async function patchCreditNote(id: string, values: { status?: CreditNoteFormValues["status"]; reason?: string | null }): Promise<void> {
  const res = await fetch(`/api/v1/credit-notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to update credit note");
  }
}

export function CreditNotesClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["credit-notes", { page, pageSize, search, statusFilter }],
    queryFn: () =>
      fetchCreditNotes({
        page,
        pageSize,
        search,
        status: statusFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: (values: CreditNoteFormValues) => saveCreditNote(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success("Credit note issued");
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error("Issue failed", { description: e.message }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: { status?: CreditNoteFormValues["status"]; reason?: string | null } }) =>
      patchCreditNote(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success("Credit note updated");
    },
    onError: (e: Error) => toast.error("Update failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<CreditNoteItem>[]>(
    () => [
      {
        id: "number",
        header: "Credit Note #",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-brand font-medium">
            {row.original.number}
          </span>
        ),
      },
      {
        id: "invoice",
        header: "Invoice",
        cell: ({ row }) => (
          <div className="flex flex-col">
            {row.original.invoiceNumber ? (
              <span className="font-mono text-xs">{row.original.invoiceNumber}</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {row.original.subscriber ? (
              <span className="text-[11px] text-muted-foreground">
                {row.original.subscriber.firstName} {row.original.subscriber.lastName} ·{" "}
                <span className="font-mono">{row.original.subscriber.customerId}</span>
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums font-medium flex items-center">
            <DollarSign className="h-3 w-3 text-muted-foreground mr-0.5" />
            {row.original.amount.toFixed(2)}
          </span>
        ),
      },
      {
        id: "reason",
        header: "Reason",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
            {row.original.reason ?? "—"}
          </span>
        ),
      },
      {
        id: "issuedAt",
        header: "Issued",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {format(new Date(row.original.issuedAt), "MMM d, yyyy")}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const canApply = row.original.status === "issued";
          const canCancel = row.original.status !== "cancelled";
          return (
            <div className="flex items-center justify-end gap-1">
              {canApply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={patchMutation.isPending}
                  onClick={() =>
                    patchMutation.mutate({
                      id: row.original.id,
                      values: { status: "applied" },
                    })
                  }
                >
                  <CheckCircle2 className="h-3 w-3 mr-1 text-success" />
                  Mark Applied
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:text-destructive"
                  disabled={patchMutation.isPending}
                  onClick={() =>
                    patchMutation.mutate({
                      id: row.original.id,
                      values: { status: "cancelled" },
                    })
                  }
                  aria-label="Cancel credit note"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [patchMutation]
  );

  const notes = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const issuedCount = notes.filter((n) => n.status === "issued").length;
  const appliedCount = notes.filter((n) => n.status === "applied").length;
  const totalAmount = notes
    .filter((n) => n.status !== "cancelled")
    .reduce((sum, n) => sum + n.amount, 0);

  return (
    <>
      <PageHeader
        title="Credit Notes"
        description="Issue credit notes against invoices for refunds, service outages, billing corrections, or pro-rated adjustments."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Credit Note
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <FileMinus className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Credit Notes
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{issuedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Issued
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
              <p className="text-xl font-semibold tabular-nums">{appliedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Applied
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <DollarSign className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {formatCurrency(totalAmount)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Credit Outstanding
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
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={notes}
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
        searchPlaceholder="Search by credit note #, invoice #, or reason…"
        emptyMessage="No credit notes"
        emptyDescription="Issue a credit note to refund or adjust a subscriber's invoice."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileMinus className="h-5 w-5 text-brand" /> New Credit Note
            </DialogTitle>
            <DialogDescription>
              Credit notes are immutable financial records. Once issued, only status and reason
              can be changed. Cancelled notes remain in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <CreditNoteForm
            isSaving={createMutation.isPending}
            onSave={(values) => createMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------
// FORM — create only (PATCH handled inline)
// ---------------------------------------------------------------------

function CreditNoteForm({
  isSaving,
  onSave,
}: {
  isSaving: boolean;
  onSave: (values: CreditNoteFormValues) => void;
}) {
  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ["invoices-mini"],
    queryFn: fetchInvoices,
    staleTime: 60_000,
  });

  const generateNumber = () => {
    const year = new Date().getFullYear();
    const seq = Math.floor(Math.random() * 90000) + 10000;
    return `CN-${year}-${seq}`;
  };

  const [form, setForm] = useState<{
    invoiceId: string;
    number: string;
    amount: string;
    reason: string;
    status: CreditNoteFormValues["status"];
  }>({
    invoiceId: "",
    number: generateNumber(),
    amount: "",
    reason: "",
    status: "issued",
  });

  const selectedInvoice = invoices?.find((i) => i.id === form.invoiceId);
  const amountNum = form.amount ? parseFloat(form.amount) : 0;
  const exceedsTotal =
    selectedInvoice && amountNum > Number(selectedInvoice.total);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          invoiceId: form.invoiceId,
          number: form.number,
          amount: amountNum,
          reason: form.reason || undefined,
          status: form.status,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="cn-inv">Invoice *</Label>
        <Select
          value={form.invoiceId}
          onValueChange={(v) => setForm((p) => ({ ...p, invoiceId: v }))}
        >
          <SelectTrigger id="cn-inv">
            <SelectValue placeholder={invLoading ? "Loading invoices…" : "Select an invoice"} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {invoices?.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                <span className="flex items-center gap-2">
                  <Receipt className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono">{i.number}</span>
                  <span className="text-[11px] text-muted-foreground">
                    · {formatCurrency(i.total)}
                  </span>
                  {i.subscriber && (
                    <span className="text-[11px] text-muted-foreground">
                      · {i.subscriber.firstName} {i.subscriber.lastName}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedInvoice && (
          <p className="text-xs text-muted-foreground">
            Invoice total:{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(Number(selectedInvoice.total))}
            </span>{" "}
            · status: <span className="capitalize">{selectedInvoice.status}</span>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cn-num">Credit Note # *</Label>
          <Input
            id="cn-num"
            value={form.number}
            onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))}
            placeholder="CN-2025-0001"
            className="font-mono"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cn-amt">Amount ($) *</Label>
          <div className="relative">
            <Input
              id="cn-amt"
              type="number"
              min="0.01"
              step="any"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              className={cn("pl-7", exceedsTotal && "border-destructive focus-visible:ring-destructive")}
              required
            />
            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
      {exceedsTotal && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Amount exceeds invoice total — backend will reject this.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="cn-reason">Reason</Label>
        <Textarea
          id="cn-reason"
          value={form.reason}
          onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
          placeholder="Service outage credit, overcharge correction, pro-rated refund…"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={form.status}
          onValueChange={(v: CreditNoteFormValues["status"]) =>
            setForm((p) => ({ ...p, status: v }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button
          type="submit"
          disabled={isSaving || !form.invoiceId || !form.number || amountNum <= 0 || exceedsTotal}
        >
          {isSaving ? "Issuing…" : "Issue Credit Note"}
        </Button>
      </DialogFooter>
    </form>
  );
}
