// =====================================================================
// IPAM CLIENT — Subnet overview with utilization bars, CRUD, IP allocation
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
  Plus,
  Edit,
  Trash2,
  Network,
  Share2 as SubnetIcon,
  Activity,
  Zap,
  Loader2,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SubnetItem {
  id: string;
  name: string;
  network: string;
  cidr: number;
  cidrNotation: string;
  gateway: string | null;
  dnsPrimary: string | null;
  vlanId: number | null;
  type: string;
  status: string;
  description: string | null;
  totalAddresses: number;
  usableAddresses: number;
  allocatedCount: number;
  utilization: number;
  activeDhcpLeases: number;
  createdAt: string;
}

async function fetchSubnets(params: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}): Promise<{ data: SubnetItem[]; total: number }> {
  const url = new URL("/api/v1/subnets", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch subnets");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveSubnet(data: any): Promise<void> {
  const isEdit = !!data.id;
  const res = await fetch(isEdit ? `/api/v1/subnets/${data.id}` : "/api/v1/subnets", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save subnet");
  }
}

async function deleteSubnet(id: string): Promise<void> {
  const res = await fetch(`/api/v1/subnets/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete subnet");
  }
}

const TYPE_LABELS: Record<string, string> = {
  data: "Data",
  voice: "Voice",
  management: "Management",
  guest: "Guest",
  pppoe: "PPPoE",
};

const TYPE_COLORS: Record<string, string> = {
  data: "bg-brand/10 text-brand",
  voice: "bg-info/10 text-info",
  management: "bg-success/10 text-success",
  guest: "bg-warning/10 text-warning",
  pppoe: "bg-muted text-muted-foreground",
};

function getUtilColor(pct: number): string {
  if (pct >= 90) return "bg-destructive";
  if (pct >= 70) return "bg-warning";
  if (pct >= 30) return "bg-success";
  return "bg-brand";
}

export function IpamClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubnetItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubnetItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["subnets", { page, pageSize, search, statusFilter }],
    queryFn: () => fetchSubnets({ page, pageSize, search, status: statusFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: saveSubnet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subnets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Subnet saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubnet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subnets"] });
      toast.success("Subnet deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<SubnetItem>[]>(
    () => [
      {
        id: "subnet",
        header: "Subnet",
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  s.status === "active" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
                )}
              >
                <SubnetIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <code className="text-xs text-muted-foreground font-mono">{s.cidrNotation}</code>
              </div>
            </div>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
              TYPE_COLORS[row.original.type] ?? TYPE_COLORS.data
            )}
          >
            {TYPE_LABELS[row.original.type] ?? row.original.type}
          </span>
        ),
      },
      {
        id: "gateway",
        header: "Gateway / VLAN",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="font-mono">{row.original.gateway ?? "—"}</p>
            {row.original.vlanId && (
              <Badge variant="outline" className="text-[10px] mt-0.5">VLAN {row.original.vlanId}</Badge>
            )}
          </div>
        ),
      },
      {
        id: "addresses",
        header: "Addresses",
        cell: ({ row }) => (
          <div className="text-xs tabular-nums">
            <p className="font-medium">
              {row.original.allocatedCount} / {row.original.usableAddresses}
            </p>
            <p className="text-muted-foreground">of {row.original.totalAddresses} total</p>
          </div>
        ),
      },
      {
        id: "utilization",
        header: "Utilization",
        cell: ({ row }) => {
          const pct = row.original.utilization;
          return (
            <div className="space-y-1 w-28">
              <div className="flex items-center justify-between text-xs">
                <span className="tabular-nums font-medium">{pct.toFixed(1)}%</span>
                <span className="text-muted-foreground">{row.original.activeDhcpLeases} DHCP</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", getUtilColor(pct))}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="IP Address Management"
        description="Manage subnets, allocate IPs, and track utilization across your network."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Subnet
          </Button>
        }
      />

      {/* Stat tiles */}
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
                <Network className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">{data.total}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Subnets</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
                <Gauge className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.reduce((sum, s) => sum + s.usableAddresses, 0).toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Usable IPs</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.reduce((sum, s) => sum + s.allocatedCount, 0).toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Allocated</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {data.data.reduce((sum, s) => sum + s.activeDhcpLeases, 0).toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">DHCP Leases</p>
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
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="exhausted">Exhausted</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
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
        searchPlaceholder="Search by name, network, or CIDR…"
        emptyMessage="No subnets"
        emptyDescription="Create your first subnet to start managing IP allocations."
      />

      {/* Create / Edit dialog */}
      <Dialog
        open={createOpen || !!editTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "Create New Subnet"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update subnet configuration. Network and CIDR cannot be changed after creation."
                : "Define a new subnet. IPs will be auto-allocated for subnets /24 or smaller."}
            </DialogDescription>
          </DialogHeader>
          <SubnetForm
            subnet={editTarget}
            isSaving={saveMutation.isPending}
            onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subnet?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>{" "}
              ({deleteTarget?.cidrNotation})? All allocated IPs must be released first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete subnet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------
// SUBNET FORM
// ---------------------------------------------------------------------

function SubnetForm({
  subnet,
  isSaving,
  onSave,
}: {
  subnet: SubnetItem | null;
  isSaving: boolean;
  onSave: (values: any) => void;
}) {
  const isEdit = !!subnet;
  const [form, setForm] = useState({
    name: subnet?.name ?? "",
    network: subnet?.network ?? "",
    cidr: String(subnet?.cidr ?? "24"),
    gateway: subnet?.gateway ?? "",
    dnsPrimary: subnet?.dnsPrimary ?? "",
    dnsSecondary: "",
    vlanId: subnet?.vlanId ? String(subnet.vlanId) : "",
    type: subnet?.type ?? "data",
    description: subnet?.description ?? "",
    autoAllocateIps: true,
  });

  const handleChange = (key: string, value: any) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...form,
          cidr: Number(form.cidr),
          vlanId: form.vlanId ? Number(form.vlanId) : undefined,
          autoAllocateIps: form.autoAllocateIps && !isEdit,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="subnet-name">Name *</Label>
          <Input
            id="subnet-name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="e.g. Subscriber Pool 1"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subnet-type">Type</Label>
          <Select value={form.type} onValueChange={(v) => handleChange("type", v)}>
            <SelectTrigger id="subnet-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="subnet-network">Network *</Label>
          <Input
            id="subnet-network"
            value={form.network}
            onChange={(e) => handleChange("network", e.target.value)}
            placeholder="192.168.1.0"
            disabled={isEdit}
            required
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subnet-cidr">CIDR *</Label>
          <Select value={form.cidr} onValueChange={(v) => handleChange("cidr", v)} disabled={isEdit}>
            <SelectTrigger id="subnet-cidr">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["8", "12", "16", "20", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32"].map((c) => (
                <SelectItem key={c} value={c}>/{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="subnet-gateway">Gateway</Label>
          <Input
            id="subnet-gateway"
            value={form.gateway}
            onChange={(e) => handleChange("gateway", e.target.value)}
            placeholder="192.168.1.1"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subnet-vlan">VLAN ID</Label>
          <Input
            id="subnet-vlan"
            type="number"
            min="1"
            max="4094"
            value={form.vlanId}
            onChange={(e) => handleChange("vlanId", e.target.value)}
            placeholder="100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="subnet-dns1">DNS Primary</Label>
          <Input
            id="subnet-dns1"
            value={form.dnsPrimary}
            onChange={(e) => handleChange("dnsPrimary", e.target.value)}
            placeholder="8.8.8.8"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subnet-dns2">DNS Secondary</Label>
          <Input
            id="subnet-dns2"
            value={form.dnsSecondary}
            onChange={(e) => handleChange("dnsSecondary", e.target.value)}
            placeholder="8.8.4.4"
            className="font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subnet-desc">Description</Label>
        <Input
          id="subnet-desc"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Optional notes about this subnet"
        />
      </div>

      {!isEdit && (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2">
          IPs will be pre-allocated for subnets /24 or smaller. Larger subnets use on-demand allocation.
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name || !form.network}>
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {isEdit ? "Save changes" : "Create subnet"}
        </Button>
      </DialogFooter>
    </form>
  );
}
