// =====================================================================
// LEADS CLIENT — CRM pipeline (new → contacted → interested → qualified → converted → lost)
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
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  UserPlus,
  Plus,
  Edit,
  Trash2,
  Users,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Phone,
  Mail,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LeadItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  areaId: string | null;
  source: string;
  status: string;
  interestedPlanId: string | null;
  estimatedValue: number | null;
  notes: string | null;
  followUpDate: string | null;
  convertedSubscriberId: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LeadFormValues {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  source: "website" | "whatsapp" | "referral" | "walk_in" | "call" | "social_media" | "other";
  status: "new" | "contacted" | "interested" | "qualified" | "converted" | "lost";
  interestedPlanId?: string;
  estimatedValue?: number | null;
  notes?: string;
  followUpDate?: string | null;
  assignedTo?: string;
}

const SOURCES = [
  { value: "website", label: "Website" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referral", label: "Referral" },
  { value: "walk_in", label: "Walk-In" },
  { value: "call", label: "Inbound Call" },
  { value: "social_media", label: "Social Media" },
  { value: "other", label: "Other" },
];

const STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

const SOURCE_COLORS: Record<string, string> = {
  website: "bg-brand/10 text-brand",
  whatsapp: "bg-success/10 text-success",
  referral: "bg-info/10 text-info",
  walk_in: "bg-warning/10 text-warning",
  call: "bg-info/10 text-info",
  social_media: "bg-warning/10 text-warning",
  other: "bg-muted text-muted-foreground",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

async function fetchLeads(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
  source: string;
}): Promise<{ data: LeadItem[]; total: number }> {
  const url = new URL("/api/v1/leads", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.source && params.source !== "all") url.searchParams.set("source", params.source);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch leads");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveLead(values: LeadFormValues & { id?: string }): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(isEdit ? `/api/v1/leads/${values.id}` : "/api/v1/leads", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save lead");
  }
}

async function deleteLead(id: string): Promise<void> {
  const res = await fetch(`/api/v1/leads/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete lead");
  }
}

export function LeadsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeadItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["leads", { page, pageSize, search, statusFilter, sourceFilter }],
    queryFn: () =>
      fetchLeads({
        page,
        pageSize,
        search,
        status: statusFilter,
        source: sourceFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: LeadFormValues & { id?: string }) => saveLead(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<LeadItem>[]>(
    () => [
      {
        id: "name",
        header: "Lead",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <p className="text-sm font-medium truncate">{row.original.name}</p>
            <div className="flex flex-col gap-0.5 mt-0.5">
              {row.original.phone && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {row.original.phone}
                </span>
              )}
              {row.original.email && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{row.original.email}</span>
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium capitalize",
              SOURCE_COLORS[row.original.source] ?? "bg-muted text-muted-foreground"
            )}
          >
            {row.original.source.replace(/_/g, " ")}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "estimatedValue",
        header: "Est. Value",
        cell: ({ row }) =>
          row.original.estimatedValue ? (
            <span className="text-sm tabular-nums font-medium">
              {formatCurrency(row.original.estimatedValue)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "followUpDate",
        header: "Follow-up",
        cell: ({ row }) => {
          if (!row.original.followUpDate) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          const date = new Date(row.original.followUpDate);
          const overdue = isPast(date) && row.original.status !== "converted" && row.original.status !== "lost";
          return (
            <div className="flex items-center gap-1.5">
              <CalendarClock
                className={cn(
                  "h-3 w-3",
                  overdue ? "text-destructive" : "text-muted-foreground"
                )}
              />
              <div className="flex flex-col">
                <span className="text-xs">{format(date, "MMM d, yyyy")}</span>
                <span
                  className={cn(
                    "text-[10px]",
                    overdue ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {formatDistanceToNow(date, { addSuffix: true })}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: "assignedTo",
        header: "Assigned",
        cell: ({ row }) =>
          row.original.assignedTo ? (
            <Badge variant="outline" className="text-[11px]">
              {row.original.assignedTo}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
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
              aria-label="Edit lead"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete lead"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const leads = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const newCount = leads.filter((l) => l.status === "new").length;
  const qualifiedCount = leads.filter((l) => l.status === "qualified").length;
  const convertedCount = leads.filter((l) => l.status === "converted").length;

  return (
    <>
      <PageHeader
        title="Leads CRM"
        description="Track prospects through the sales pipeline — new → contacted → qualified → converted."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Lead
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Leads
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{newCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                New
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{qualifiedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Qualified
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
              <p className="text-xl font-semibold tabular-nums">{convertedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Converted
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
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            setSourceFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={leads}
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
        searchPlaceholder="Search by name, email, phone, notes…"
        emptyMessage="No leads"
        emptyDescription="Create a lead to start tracking prospects through your pipeline."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-brand" /> New Lead
            </DialogTitle>
            <DialogDescription>
              Capture a new prospect. Status starts as &quot;new&quot; by default.
            </DialogDescription>
          </DialogHeader>
          <LeadForm
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
              <Edit className="h-5 w-5 text-brand" /> Edit Lead
            </DialogTitle>
            <DialogDescription>
              Update <span className="font-medium text-foreground">{editTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <LeadForm
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
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>.
              This action cannot be undone.
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

      {/* Pipeline helper */}
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        Pipeline: <span className="text-foreground font-medium">New</span> →{" "}
        <span className="text-foreground font-medium">Contacted</span> →{" "}
        <span className="text-foreground font-medium">Interested</span> →{" "}
        <span className="text-foreground font-medium">Qualified</span> →{" "}
        <span className="text-foreground font-medium">Converted</span> (or Lost).
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// FORM — used for both create and edit
// ---------------------------------------------------------------------

function LeadForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: LeadItem;
  isSaving: boolean;
  onSave: (values: LeadFormValues) => void;
}) {
  const [form, setForm] = useState<{
    name: string;
    email: string;
    phone: string;
    address: string;
    source: LeadFormValues["source"];
    status: LeadFormValues["status"];
    interestedPlanId: string;
    estimatedValue: string;
    notes: string;
    followUpDate: string;
    assignedTo: string;
  }>({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    source: (initial?.source as LeadFormValues["source"]) ?? "website",
    status: (initial?.status as LeadFormValues["status"]) ?? "new",
    interestedPlanId: initial?.interestedPlanId ?? "",
    estimatedValue: initial?.estimatedValue?.toString() ?? "",
    notes: initial?.notes ?? "",
    followUpDate: initial?.followUpDate
      ? new Date(initial.followUpDate).toISOString().slice(0, 16)
      : "",
    assignedTo: initial?.assignedTo ?? "",
  });

  const estValue = form.estimatedValue ? parseFloat(form.estimatedValue) : null;
  const followUp =
    form.followUpDate && form.followUpDate.trim() !== ""
      ? new Date(form.followUpDate).toISOString()
      : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
          source: form.source,
          status: form.status,
          interestedPlanId: form.interestedPlanId || undefined,
          estimatedValue: estValue,
          notes: form.notes || undefined,
          followUpDate: followUp,
          assignedTo: form.assignedTo || undefined,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="l-name">Name *</Label>
        <Input
          id="l-name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Prospect name"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="l-email">Email</Label>
          <Input
            id="l-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="prospect@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="l-phone">Phone</Label>
          <Input
            id="l-phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+91 98765 43210"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="l-address">Address</Label>
        <Input
          id="l-address"
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          placeholder="Locality, city"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Source</Label>
          <Select
            value={form.source}
            onValueChange={(v: LeadFormValues["source"]) =>
              setForm((p) => ({ ...p, source: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(v: LeadFormValues["status"]) =>
              setForm((p) => ({ ...p, status: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="l-plan">Interested Plan ID</Label>
          <Input
            id="l-plan"
            value={form.interestedPlanId}
            onChange={(e) => setForm((p) => ({ ...p, interestedPlanId: e.target.value }))}
            placeholder="Plan ID (optional)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="l-value">Estimated Value (USD)</Label>
          <Input
            id="l-value"
            type="number"
            min="0"
            step="any"
            value={form.estimatedValue}
            onChange={(e) => setForm((p) => ({ ...p, estimatedValue: e.target.value }))}
            placeholder="0"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="l-followup">Follow-up Date</Label>
          <Input
            id="l-followup"
            type="datetime-local"
            value={form.followUpDate}
            onChange={(e) => setForm((p) => ({ ...p, followUpDate: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="l-assigned">Assigned To</Label>
          <Input
            id="l-assigned"
            value={form.assignedTo}
            onChange={(e) => setForm((p) => ({ ...p, assignedTo: e.target.value }))}
            placeholder="Sales rep username"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="l-notes">Notes</Label>
        <Textarea
          id="l-notes"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Requirements, conversation history…"
          rows={3}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Lead"}
        </Button>
      </DialogFooter>
    </form>
  );
}
