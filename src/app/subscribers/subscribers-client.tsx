// =====================================================================
// SUBSCRIBERS CLIENT — list, create, edit, lifecycle (suspend/reactivate/terminate)
// Server-side paginated DataTable with search, status filter, plan filter.
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  UserPlus,
  MoreHorizontal,
  Eye,
  Pause,
  Play,
  XCircle,
  Trash2,
  UserCircle,
  Loader2,
} from "lucide-react";
import { SubscriberForm } from "./subscriber-form";

interface Plan {
  id: string;
  name: string;
  code: string;
}

interface SubscriberListItem {
  id: string;
  customerId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  username: string | null;
  plan: {
    id: string;
    name: string;
    code: string;
    downloadSpeed: number | null;
    uploadSpeed: number | null;
  } | null;
  activeSessions: number;
  invoiceCount: number;
  paymentCount: number;
  complaintCount: number;
  createdAt: string;
}

interface LifecycleTarget {
  subscriber: SubscriberListItem;
  action: "suspend" | "reactivate" | "terminate";
}

async function fetchSubscribers(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: SubscriberListItem[]; total: number }> {
  const url = new URL("/api/v1/subscribers", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch subscribers");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchPlans(): Promise<Plan[]> {
  const res = await fetch("/api/v1/plans", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data.plans;
}

async function lifecycleAction(
  id: string,
  action: string,
  reason?: string
): Promise<void> {
  const res = await fetch(`/api/v1/subscribers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Failed to ${action} subscriber`);
  }
}

export function SubscribersClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["subscribers", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchSubscribers({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const { data: plansData } = useQuery({ queryKey: ["plans"], queryFn: fetchPlans });

  const lifecycleMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: string; reason?: string }) =>
      lifecycleAction(id, action, reason),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const verb = vars.action === "suspend" ? "Suspended" : vars.action === "reactivate" ? "Reactivated" : "Terminated";
      toast.success(`Subscriber ${verb.toLowerCase()}`);
      setLifecycleTarget(null);
      setLifecycleReason("");
    },
    onError: (e: Error) => toast.error("Action failed", { description: e.message }),
  });

  const columns = useMemo<ColumnDef<SubscriberListItem>[]>(
    () => [
      {
        id: "subscriber",
        header: "Subscriber",
        cell: ({ row }) => {
          const s = row.original;
          const initials = `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase();
          return (
            <button
              onClick={() => router.push(`/subscribers/${s.id}`)}
              className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-brand/15 text-brand text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.fullName}</p>
                <code className="text-xs text-muted-foreground font-mono">{s.customerId}</code>
              </div>
            </button>
          );
        },
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="truncate max-w-[180px]">{row.original.email ?? "—"}</p>
            <p className="text-muted-foreground">{row.original.phone ?? "—"}</p>
          </div>
        ),
      },
      {
        id: "plan",
        header: "Plan",
        cell: ({ row }) =>
          row.original.plan ? (
            <Badge variant="outline" className="font-normal">
              {row.original.plan.name}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">No plan</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "sessions",
        header: "Sessions",
        cell: ({ row }) => (
          <span className={row.original.activeSessions > 0 ? "text-success font-medium" : "text-muted-foreground"}>
            {row.original.activeSessions} active
          </span>
        ),
      },
      {
        id: "activity",
        header: "Activity",
        cell: ({ row }) => (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{row.original.invoiceCount} inv</span>
            <span>·</span>
            <span>{row.original.paymentCount} pay</span>
            {row.original.complaintCount > 0 && (
              <>
                <span>·</span>
                <span className="text-warning">{row.original.complaintCount} comp</span>
              </>
            )}
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
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
        cell: ({ row }) => {
          const s = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => router.push(`/subscribers/${s.id}`)}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> View 360°
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {s.status === "active" && (
                  <DropdownMenuItem
                    className="text-warning focus:text-warning"
                    onClick={() => setLifecycleTarget({ subscriber: s, action: "suspend" })}
                  >
                    <Pause className="mr-2 h-3.5 w-3.5" /> Suspend
                  </DropdownMenuItem>
                )}
                {s.status === "suspended" && (
                  <DropdownMenuItem
                    className="text-success focus:text-success"
                    onClick={() => setLifecycleTarget({ subscriber: s, action: "reactivate" })}
                  >
                    <Play className="mr-2 h-3.5 w-3.5" /> Reactivate
                  </DropdownMenuItem>
                )}
                {(s.status === "active" || s.status === "suspended") && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setLifecycleTarget({ subscriber: s, action: "terminate" })}
                  >
                    <XCircle className="mr-2 h-3.5 w-3.5" /> Terminate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [router]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  return (
    <>
      <PageHeader
        title="Subscribers"
        description="Manage subscriber lifecycle: create, assign plans, suspend, reactivate, terminate."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-2 h-3.5 w-3.5" /> New Subscriber
          </Button>
        }
      />

      {/* Filters bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
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
        searchPlaceholder="Search by name, customer ID, email, phone, username…"
        emptyMessage="No subscribers found"
        emptyDescription="Create your first subscriber or adjust your filters."
        onRowClick={(row) => router.push(`/subscribers/${row.id}`)}
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create new subscriber</DialogTitle>
            <DialogDescription>
              Add a subscriber and optionally assign a plan and RADIUS credentials.
              Status starts as "pending" — activate once provisioning is complete.
            </DialogDescription>
          </DialogHeader>
          <SubscriberForm
            mode="create"
            plans={plansData ?? []}
            onSuccess={() => {
              setCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: ["subscribers"] });
              queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Lifecycle action dialog */}
      <Dialog
        open={!!lifecycleTarget}
        onOpenChange={(o) => {
          if (!o) {
            setLifecycleTarget(null);
            setLifecycleReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {lifecycleTarget?.action === "suspend" && (
                <>
                  <Pause className="h-5 w-5 text-warning" /> Suspend subscriber
                </>
              )}
              {lifecycleTarget?.action === "reactivate" && (
                <>
                  <Play className="h-5 w-5 text-success" /> Reactivate subscriber
                </>
              )}
              {lifecycleTarget?.action === "terminate" && (
                <>
                  <XCircle className="h-5 w-5 text-destructive" /> Terminate subscriber
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {lifecycleTarget?.action === "suspend" && (
                <>
                  Suspend <span className="font-medium text-foreground">{lifecycleTarget?.subscriber.fullName}</span>?
                  This will trigger a RADIUS CoA/Disconnect (when AAA is enabled) to drop any active sessions.
                </>
              )}
              {lifecycleTarget?.action === "reactivate" && (
                <>
                  Reactivate <span className="font-medium text-foreground">{lifecycleTarget?.subscriber.fullName}</span>?
                  The subscriber will be able to authenticate again immediately.
                </>
              )}
              {lifecycleTarget?.action === "terminate" && (
                <>
                  Permanently terminate <span className="font-medium text-foreground">{lifecycleTarget?.subscriber.fullName}</span>?
                  This will disconnect active sessions and prevent future authentication. This action is irreversible.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={lifecycleReason}
              onChange={(e) => setLifecycleReason(e.target.value)}
              placeholder="e.g. Non-payment, customer request, abuse, migration…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifecycleTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={
                lifecycleTarget?.action === "suspend"
                  ? "default"
                  : lifecycleTarget?.action === "reactivate"
                    ? "default"
                    : "destructive"
              }
              disabled={lifecycleMutation.isPending}
              onClick={() => {
                if (!lifecycleTarget) return;
                lifecycleMutation.mutate({
                  id: lifecycleTarget.subscriber.id,
                  action: lifecycleTarget.action,
                  reason: lifecycleReason || undefined,
                });
              }}
            >
              {lifecycleMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {lifecycleTarget?.action === "suspend" && "Suspend"}
              {lifecycleTarget?.action === "reactivate" && "Reactivate"}
              {lifecycleTarget?.action === "terminate" && "Terminate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
