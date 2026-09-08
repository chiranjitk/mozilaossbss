// =====================================================================
// AGENTS CLIENT — field collection agents with targets & commission
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
import {
  BadgeDollarSign,
  Plus,
  Edit,
  Trash2,
  Phone,
  Mail,
  Target,
  CalendarDays,
  CheckCircle2,
  Users,
} from "lucide-react";

interface AgentItem {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  employeeId: string | null;
  status: string;
  dailyTarget: number;
  monthlyTarget: number;
  commissionRate: number;
  createdAt: string;
  updatedAt: string;
}

interface AgentFormValues {
  name: string;
  phone?: string;
  email?: string;
  employeeId?: string;
  status: "active" | "inactive" | "suspended";
  dailyTarget: number;
  monthlyTarget: number;
  commissionRate: number;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

async function fetchAgents(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: AgentItem[]; total: number }> {
  const url = new URL("/api/v1/agents", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch agents");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveAgent(values: AgentFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(isEdit ? `/api/v1/agents/${values.id}` : "/api/v1/agents", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save agent");
  }
}

async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`/api/v1/agents/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete agent");
  }
}

export function AgentsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AgentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["agents", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchAgents({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: AgentFormValues & { id?: string }) => saveAgent(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<AgentItem>[]>(
    () => [
      {
        id: "name",
        header: "Agent",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <p className="text-sm font-medium truncate">{row.original.name}</p>
            {row.original.employeeId && (
              <p className="text-[11px] text-muted-foreground font-mono">
                ID: {row.original.employeeId}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            {row.original.phone && (
              <span className="text-xs flex items-center gap-1">
                <Phone className="h-3 w-3 text-muted-foreground" />
                {row.original.phone}
              </span>
            )}
            {row.original.email && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {row.original.email}
              </span>
            )}
            {!row.original.phone && !row.original.email && (
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
        id: "dailyTarget",
        header: "Daily Target",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm tabular-nums">
              {formatCurrency(row.original.dailyTarget)}
            </span>
          </div>
        ),
      },
      {
        id: "monthlyTarget",
        header: "Monthly Target",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm tabular-nums">
              {formatCurrency(row.original.monthlyTarget)}
            </span>
          </div>
        ),
      },
      {
        id: "commissionRate",
        header: "Commission",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums font-medium">
            {row.original.commissionRate}%
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
              aria-label="Edit agent"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete agent"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const agents = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const activeCount = agents.filter((a) => a.status === "active").length;
  const totalDailyTarget = agents.reduce((sum, a) => sum + a.dailyTarget, 0);

  return (
    <>
      <PageHeader
        title="Collection Agents"
        description="Field agents responsible for in-person payment collection, with daily and monthly targets."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Agent
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Agents
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
              <Target className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {formatCurrency(totalDailyTarget)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Daily Target
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
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={agents}
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
        searchPlaceholder="Search by name, employee ID, phone, email…"
        emptyMessage="No agents"
        emptyDescription="Create an agent to start tracking collection targets."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeDollarSign className="h-5 w-5 text-brand" /> New Collection Agent
            </DialogTitle>
            <DialogDescription>
              Onboard a field agent with daily/monthly collection targets and commission rate.
            </DialogDescription>
          </DialogHeader>
          <AgentForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Agent
            </DialogTitle>
            <DialogDescription>
              Update <span className="font-medium text-foreground">{editTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <AgentForm
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
            <AlertDialogTitle>Delete agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>
              {deleteTarget?.employeeId ? (
                <>
                  {" "}
                  (ID: <code className="font-mono">{deleteTarget.employeeId}</code>)
                </>
              ) : null}
              . This action cannot be undone.
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

function AgentForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: AgentItem;
  isSaving: boolean;
  onSave: (values: AgentFormValues) => void;
}) {
  const [form, setForm] = useState<{
    name: string;
    phone: string;
    email: string;
    employeeId: string;
    status: AgentFormValues["status"];
    dailyTarget: string;
    monthlyTarget: string;
    commissionRate: string;
  }>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    employeeId: initial?.employeeId ?? "",
    status: (initial?.status as AgentFormValues["status"]) ?? "active",
    dailyTarget: initial?.dailyTarget?.toString() ?? "5000",
    monthlyTarget: initial?.monthlyTarget?.toString() ?? "150000",
    commissionRate: initial?.commissionRate?.toString() ?? "5",
  });

  const daily = form.dailyTarget ? parseFloat(form.dailyTarget) : 0;
  const monthly = form.monthlyTarget ? parseFloat(form.monthlyTarget) : 0;
  const rate = form.commissionRate ? parseFloat(form.commissionRate) : 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          phone: form.phone || undefined,
          email: form.email || undefined,
          employeeId: form.employeeId || undefined,
          status: form.status,
          dailyTarget: daily,
          monthlyTarget: monthly,
          commissionRate: rate,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="a-name">Name *</Label>
          <Input
            id="a-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Suresh Patel"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="a-emp">Employee ID</Label>
          <Input
            id="a-emp"
            value={form.employeeId}
            onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}
            placeholder="EMP-001"
            className="font-mono"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="a-phone">Phone</Label>
          <Input
            id="a-phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+91 98765 43210"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="a-email">Email</Label>
          <Input
            id="a-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="suresh@cryptsk.com"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="a-daily">Daily Target ($)</Label>
          <Input
            id="a-daily"
            type="number"
            min="0"
            step="any"
            value={form.dailyTarget}
            onChange={(e) => setForm((p) => ({ ...p, dailyTarget: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="a-monthly">Monthly Target ($)</Label>
          <Input
            id="a-monthly"
            type="number"
            min="0"
            step="any"
            value={form.monthlyTarget}
            onChange={(e) => setForm((p) => ({ ...p, monthlyTarget: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="a-rate">Commission (%)</Label>
          <Input
            id="a-rate"
            type="number"
            min="0"
            step="any"
            value={form.commissionRate}
            onChange={(e) => setForm((p) => ({ ...p, commissionRate: e.target.value }))}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={form.status}
          onValueChange={(v: AgentFormValues["status"]) =>
            setForm((p) => ({ ...p, status: v }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Agent"}
        </Button>
      </DialogFooter>
    </form>
  );
}
