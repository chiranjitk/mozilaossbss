// =====================================================================
// RESELLERS CLIENT — channel partner management
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
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
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
  Store,
  Plus,
  Edit,
  Trash2,
  User,
  Phone,
  Mail,
  Wallet,
  CheckCircle2,
  Percent,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ResellerItem {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  contactPerson: string | null;
  status: string;
  commissionMethod: string;
  commissionRate: number;
  creditLimit: number;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

interface ResellerFormValues {
  name: string;
  code: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  status: "active" | "suspended" | "trial";
  commissionMethod: "percentage" | "flat" | "slab";
  commissionRate: number;
  creditLimit: number;
}

const COMMISSION_METHODS = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat per Sale" },
  { value: "slab", label: "Slab / Tiered" },
];

const METHOD_COLORS: Record<string, string> = {
  percentage: "bg-brand/10 text-brand",
  flat: "bg-success/10 text-success",
  slab: "bg-info/10 text-info",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);

async function fetchResellers(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: ResellerItem[]; total: number }> {
  const url = new URL("/api/v1/resellers", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch resellers");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveReseller(
  values: ResellerFormValues & { id?: string }
): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/resellers/${values.id}` : "/api/v1/resellers",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save reseller");
  }
}

async function deleteReseller(id: string): Promise<void> {
  const res = await fetch(`/api/v1/resellers/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete reseller");
  }
}

export function ResellersClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ResellerItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResellerItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["resellers", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchResellers({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: ResellerFormValues & { id?: string }) =>
      saveReseller(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellers"] });
      toast.success("Reseller saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReseller(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellers"] });
      toast.success("Reseller deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<ResellerItem>[]>(
    () => [
      {
        id: "name",
        header: "Reseller",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <Store className="h-3.5 w-3.5 text-brand shrink-0" />
              <p className="text-sm font-medium truncate">{row.original.name}</p>
            </div>
            <p className="text-[11px] text-muted-foreground pl-5 font-mono">
              {row.original.code}
            </p>
          </div>
        ),
      },
      {
        id: "contactPerson",
        header: "Contact",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            {row.original.contactPerson && (
              <span className="text-xs flex items-center gap-1">
                <User className="h-3 w-3 text-muted-foreground" />
                {row.original.contactPerson}
              </span>
            )}
            {row.original.phone && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {row.original.phone}
              </span>
            )}
            {row.original.email && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {row.original.email}
              </span>
            )}
            {!row.original.contactPerson &&
              !row.original.phone &&
              !row.original.email && (
                <span className="text-xs text-muted-foreground">—</span>
              )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "commission",
        header: "Commission",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span
              className={cn(
                "inline-flex items-center w-fit rounded px-1.5 py-0.5 text-[11px] font-medium",
                METHOD_COLORS[row.original.commissionMethod] ?? "bg-muted text-muted-foreground"
              )}
            >
              {row.original.commissionMethod}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              {row.original.commissionMethod === "percentage" ? (
                <>
                  <Percent className="h-3 w-3" />
                  {row.original.commissionRate}%
                </>
              ) : (
                <>
                  <DollarSign className="h-3 w-3" />
                  {formatCurrency(row.original.commissionRate)}
                </>
              )}
            </span>
          </div>
        ),
      },
      {
        id: "balance",
        header: "Balance",
        cell: ({ row }) => {
          const isNegative = row.original.balance < 0;
          return (
            <div className="flex flex-col">
              <span
                className={cn(
                  "text-sm tabular-nums font-medium",
                  isNegative ? "text-destructive" : "text-foreground"
                )}
              >
                {formatCurrency(row.original.balance)}
              </span>
              {row.original.creditLimit > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  limit {formatCurrency(row.original.creditLimit)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "createdAt",
        header: "Joined",
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
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditTarget(row.original)}
              aria-label="Edit reseller"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete reseller"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const resellers = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = resellers.filter((r) => r.status === "active").length;
  const totalBalance = resellers.reduce((sum, r) => sum + r.balance, 0);

  return (
    <>
      <PageHeader
        title="Resellers"
        description="Channel partners and resellers with commission tracking, credit limits, and balances."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Reseller
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Store className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Resellers
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
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {formatCurrency(totalBalance)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Balance
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
            <SelectItem value="trial">Trial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={resellers}
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
        searchPlaceholder="Search by name, code, contact, email…"
        emptyMessage="No resellers"
        emptyDescription="Onboard a channel partner to start tracking commissions and balances."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-brand" /> New Reseller
            </DialogTitle>
            <DialogDescription>
              Onboard a channel partner with commission structure and credit limit.
            </DialogDescription>
          </DialogHeader>
          <ResellerForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Reseller
            </DialogTitle>
            <DialogDescription>
              Update <span className="font-medium text-foreground">{editTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <ResellerForm
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
            <AlertDialogTitle>Delete reseller?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> (
              <code className="font-mono">{deleteTarget?.code}</code>). Outstanding balance:{" "}
              <strong>{formatCurrency(deleteTarget?.balance ?? 0)}</strong>. This action cannot be undone.
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

function ResellerForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: ResellerItem;
  isSaving: boolean;
  onSave: (values: ResellerFormValues) => void;
}) {
  const [form, setForm] = useState<{
    name: string;
    code: string;
    email: string;
    phone: string;
    address: string;
    contactPerson: string;
    status: ResellerFormValues["status"];
    commissionMethod: ResellerFormValues["commissionMethod"];
    commissionRate: string;
    creditLimit: string;
  }>({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    contactPerson: initial?.contactPerson ?? "",
    status: (initial?.status as ResellerFormValues["status"]) ?? "active",
    commissionMethod:
      (initial?.commissionMethod as ResellerFormValues["commissionMethod"]) ?? "percentage",
    commissionRate: initial?.commissionRate?.toString() ?? "10",
    creditLimit: initial?.creditLimit?.toString() ?? "0",
  });

  const rateNum = form.commissionRate ? parseFloat(form.commissionRate) : 0;
  const limitNum = form.creditLimit ? parseFloat(form.creditLimit) : 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          code: form.code,
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
          contactPerson: form.contactPerson || undefined,
          status: form.status,
          commissionMethod: form.commissionMethod,
          commissionRate: rateNum,
          creditLimit: limitNum,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="r-name">Name *</Label>
          <Input
            id="r-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Acme Internet Partners"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-code">Code *</Label>
          <Input
            id="r-code"
            value={form.code}
            onChange={(e) =>
              setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))
            }
            placeholder="ACME01"
            className="font-mono"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="r-contact">Contact Person</Label>
          <Input
            id="r-contact"
            value={form.contactPerson}
            onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))}
            placeholder="Ramesh Kumar"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-phone">Phone</Label>
          <Input
            id="r-phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+91 98765 43210"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="r-email">Email</Label>
        <Input
          id="r-email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          placeholder="contact@acme.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="r-address">Address</Label>
        <Textarea
          id="r-address"
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          placeholder="Street, city, state, pincode"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(v: ResellerFormValues["status"]) =>
              setForm((p) => ({ ...p, status: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Commission Method</Label>
          <Select
            value={form.commissionMethod}
            onValueChange={(v: ResellerFormValues["commissionMethod"]) =>
              setForm((p) => ({ ...p, commissionMethod: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMISSION_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-rate">
            {form.commissionMethod === "percentage"
              ? "Rate (%)"
              : "Amount (USD)"}
          </Label>
          <div className="relative">
            <Input
              id="r-rate"
              type="number"
              min="0"
              step="any"
              value={form.commissionRate}
              onChange={(e) => setForm((p) => ({ ...p, commissionRate: e.target.value }))}
              required
              className={form.commissionMethod === "flat" ? "pl-7" : "pr-9"}
            />
            {form.commissionMethod === "flat" && (
              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            )}
            {form.commissionMethod === "percentage" && (
              <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="r-credit">Credit Limit (USD)</Label>
        <div className="relative">
          <Input
            id="r-credit"
            type="number"
            min="0"
            step="any"
            value={form.creditLimit}
            onChange={(e) => setForm((p) => ({ ...p, creditLimit: e.target.value }))}
            placeholder="0"
            className="pl-7"
          />
          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name || !form.code}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Reseller"}
        </Button>
      </DialogFooter>
    </form>
  );
}
