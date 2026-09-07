// =====================================================================
// COMPLAINTS CLIENT — list, create, assign, resolve, close
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  MessageSquareWarning,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ComplaintItem {
  id: string;
  ticketNo: string;
  subject: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
  subscriber: { customerId: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

async function fetchComplaints(params: { page: number; pageSize: number; search: string; status: string; priority: string }): Promise<{ data: ComplaintItem[]; total: number }> {
  const url = new URL("/api/v1/complaints", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.priority && params.priority !== "all") url.searchParams.set("priority", params.priority);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch complaints");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const CATEGORY_LABELS: Record<string, string> = {
  billing: "Billing",
  network: "Network",
  technical: "Technical",
  other: "Other",
};

export function ComplaintsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<ComplaintItem | null>(null);
  const [resolution, setResolution] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["complaints", { page, pageSize, search, statusFilter, priorityFilter }],
    queryFn: () => fetchComplaints({ page, pageSize, search, status: statusFilter, priority: priorityFilter }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await fetch("/api/v1/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "Failed to create complaint");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Complaint created");
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error("Create failed", { description: e.message }),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) => {
      const res = await fetch(`/api/v1/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved", resolution }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "Failed to resolve");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Complaint resolved");
      setResolveTarget(null);
      setResolution("");
    },
    onError: (e: Error) => toast.error("Resolve failed", { description: e.message }),
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!res.ok) throw new Error("Failed to close");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Complaint closed");
    },
    onError: () => toast.error("Close failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<ComplaintItem>[]>(
    () => [
      {
        id: "ticket",
        header: "Ticket",
        cell: ({ row }) => (
          <div>
            <code className="text-xs font-mono text-brand">{row.original.ticketNo}</code>
          </div>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <p className="text-sm font-medium truncate">{row.original.subject}</p>
            {row.original.category && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{CATEGORY_LABELS[row.original.category] ?? row.original.category}</span>
            )}
          </div>
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
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <StatusBadge status={row.original.priority} />,
      },
      {
        id: "assignee",
        header: "Assigned To",
        cell: ({ row }) => (
          row.original.assignee ? (
            <span className="text-xs">{row.original.assignee.name}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
          <div className="flex items-center gap-1 justify-end">
            {["open", "in_progress"].includes(row.original.status) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-success hover:text-success"
                onClick={() => setResolveTarget(row.original)}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolve
              </Button>
            )}
            {row.original.status === "resolved" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => closeMutation.mutate(row.original.id)}
              >
                Close
              </Button>
            )}
          </div>
        ),
      },
    ],
    [closeMutation]
  );

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Manage customer complaints and support tickets. Assign, resolve, and track issues."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Complaint
          </Button>
        }
      />

      {/* Stats */}
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
                <MessageSquareWarning className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">{data.total}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
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
                  {data.data.filter((c) => ["open", "in_progress"].includes(c.status)).length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.filter((c) => c.priority === "urgent" || c.priority === "high").length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">High Priority</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.filter((c) => ["resolved", "closed"].includes(c.status)).length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resolved</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
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
        searchPlaceholder="Search by ticket #, subject, or customer…"
        emptyMessage="No complaints"
        emptyDescription="Create a complaint to start tracking an issue."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareWarning className="h-5 w-5 text-brand" /> New Complaint
            </DialogTitle>
            <DialogDescription>Create a support ticket to track a customer issue.</DialogDescription>
          </DialogHeader>
          <ComplaintForm isSaving={createMutation.isPending} onSave={(values) => createMutation.mutate(values)} />
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={!!resolveTarget} onOpenChange={(o) => { if (!o) { setResolveTarget(null); setResolution(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" /> Resolve Complaint
            </DialogTitle>
            <DialogDescription>
              Resolve <span className="font-medium text-foreground">{resolveTarget?.ticketNo}</span>:
              {" "}{resolveTarget?.subject}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolution">Resolution Notes</Label>
            <Textarea
              id="resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Describe how the issue was resolved…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolveTarget(null); setResolution(""); }}>Cancel</Button>
            <Button
              disabled={resolveMutation.isPending || !resolution}
              onClick={() => resolveTarget && resolveMutation.mutate({ id: resolveTarget.id, resolution })}
            >
              {resolveMutation.isPending ? "Resolving…" : "Resolve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ComplaintForm({ isSaving, onSave }: { isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    subject: "",
    description: "",
    category: "other",
    priority: "normal",
    subscriberId: "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          subject: form.subject,
          description: form.description || undefined,
          category: form.category,
          priority: form.priority,
          subscriberId: form.subscriberId || undefined,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="c-subject">Subject *</Label>
        <Input
          id="c-subject"
          value={form.subject}
          onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
          placeholder="Brief description of the issue"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-desc">Description</Label>
        <Textarea
          id="c-desc"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Detailed description of the complaint…"
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.subject}>
          {isSaving ? "Creating…" : "Create Complaint"}
        </Button>
      </DialogFooter>
    </form>
  );
}
