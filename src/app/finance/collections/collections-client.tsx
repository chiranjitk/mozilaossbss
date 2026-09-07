// =====================================================================
// COLLECTIONS CLIENT — overdue invoices + collection actions
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Wallet, Clock, AlertTriangle, DollarSign, Phone, Mail, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollectionItem {
  id: string; number: string;
  subscriber: { customerId: string; name: string; phone: string | null; email: string | null; status: string } | null;
  total: number; amountPaid: number; balanceDue: number;
  issueDate: string; dueDate: string; daysOverdue: number;
  status: string; currency: string;
}

const formatCurrency = (n: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

async function fetchCollections(params: { page: number; pageSize: number; search: string; status: string }): Promise<{ data: CollectionItem[]; total: number }> {
  const url = new URL("/api/v1/collections", window.location.origin);
  url.searchParams.set("page", String(params.page)); url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json(); return { data: json.data, total: json.meta.total };
}

export function CollectionsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionTarget, setActionTarget] = useState<CollectionItem | null>(null);
  const [contactMethod, setContactMethod] = useState("phone");
  const [contactNotes, setContactNotes] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["collections", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchCollections({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ invoiceId, action, contactMethod, contactNotes }: { invoiceId: string; action: string; contactMethod?: string; contactNotes?: string }) => {
      const res = await fetch("/api/v1/collections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, action, contactMethod, contactNotes }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      const msg = vars.action === "mark_resolved" ? "Marked as resolved" : vars.action === "escalate" ? "Escalated" : "Marked as contacted";
      toast.success(msg);
      setActionTarget(null); setContactNotes("");
    },
    onError: (e: Error) => toast.error("Action failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<CollectionItem>[]>(() => [
    { id: "number", header: "Invoice", cell: ({ row }) => <code className="text-xs font-mono text-brand">{row.original.number}</code> },
    { id: "subscriber", header: "Subscriber", cell: ({ row }) => row.original.subscriber ? <div className="text-xs"><p className="font-medium">{row.original.subscriber.name}</p><code className="text-muted-foreground font-mono">{row.original.subscriber.customerId}</code></div> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "balance", header: "Balance Due", cell: ({ row }) => <span className="text-sm font-semibold tabular-nums text-destructive">{formatCurrency(row.original.balanceDue, row.original.currency)}</span> },
    { id: "due", header: "Due Date", cell: ({ row }) => <div className="text-xs"><p>{format(new Date(row.original.dueDate), "MMM d, yyyy")}</p><p className={cn(row.original.daysOverdue > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>{row.original.daysOverdue > 0 ? `${row.original.daysOverdue} days overdue` : "Due soon"}</p></div> },
    { id: "contact", header: "Contact", cell: ({ row }) => <div className="text-xs">{row.original.subscriber?.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{row.original.subscriber.phone}</p>}{row.original.subscriber?.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{row.original.subscriber.email}</p>}</div> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "", cell: ({ row }) => (
      <div className="flex items-center gap-1 justify-end">
        <Button variant="ghost" size="sm" className="h-8" onClick={() => { setActionTarget(row.original); setContactMethod("phone"); setContactNotes(""); }}>Contact</Button>
        <Button variant="ghost" size="sm" className="h-8 text-success hover:text-success" onClick={() => actionMutation.mutate({ invoiceId: row.original.id, action: "mark_resolved" })}>Resolve</Button>
      </div>
    ) },
  ], [actionMutation]);

  return (
    <>
      <PageHeader title="Collections" description="Track overdue invoices and manage collection actions. Contact subscribers, escalate, or resolve." actions={<Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh</Button>} />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Wallet className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive"><Clock className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((c) => c.daysOverdue > 0).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Overdue</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><AlertTriangle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{formatCurrency(data.data.filter((c) => c.daysOverdue > 7).reduce((s, c) => s + c.balanceDue, 0))}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Critical (&gt;7d)</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive"><DollarSign className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{formatCurrency(data.data.reduce((s, c) => s + c.balanceDue, 0))}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Due</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="partial">Partial</SelectItem><SelectItem value="issued">Issued</SelectItem></SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search by invoice # or subscriber…" emptyMessage="No outstanding invoices" emptyDescription="All invoices are paid or no invoices exist." />

      <Dialog open={!!actionTarget} onOpenChange={(o) => { if (!o) { setActionTarget(null); setContactNotes(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-brand" /> Collection Action</DialogTitle><DialogDescription>Contact subscriber for invoice {actionTarget?.number} ({actionTarget ? formatCurrency(actionTarget.balanceDue) : ""} due).</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Contact Method</Label><Select value={contactMethod} onValueChange={setContactMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phone">Phone Call</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="visit">Field Visit</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="cn">Contact Notes</Label><Textarea id="cn" value={contactNotes} onChange={(e) => setContactNotes(e.target.value)} placeholder="Notes from the contact attempt…" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionTarget(null); setContactNotes(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => actionTarget && actionMutation.mutate({ invoiceId: actionTarget.id, action: "escalate", contactMethod, contactNotes })} disabled={actionMutation.isPending}>Escalate</Button>
            <Button onClick={() => actionTarget && actionMutation.mutate({ invoiceId: actionTarget.id, action: "mark_contacted", contactMethod, contactNotes })} disabled={actionMutation.isPending}>{actionMutation.isPending ? "Saving…" : "Mark Contacted"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
