// =====================================================================
// SYSTEM INTERFACES CLIENT — list network interfaces with stats
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Cable,
  Plus,
  Wifi,
  Zap,
  Activity,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InterfaceItem {
  id: string;
  name: string;
  displayName: string | null;
  type: string;
  ipAddress: string | null;
  macAddress: string | null;
  vlanId: number | null;
  mtu: number;
  enabled: boolean;
  linkStatus: string;
  speedMbps: number | null;
  duplex: string | null;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
  nas: { id: string; name: string; ipAddress: string } | null;
  description: string | null;
  lastUpdated: string | null;
}

async function fetchInterfaces(params: { page: number; pageSize: number; search: string }): Promise<{ data: InterfaceItem[]; total: number }> {
  const url = new URL("/api/v1/interfaces", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch interfaces");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveInterface(data: any): Promise<void> {
  const res = await fetch("/api/v1/interfaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save interface");
  }
}

const TYPE_ICONS: Record<string, typeof Cable> = {
  ethernet: Cable,
  vlan: Cable,
  pppoe: Wifi,
  bridge: Cable,
  loopback: Activity,
  wan: Zap,
};

const TYPE_COLORS: Record<string, string> = {
  ethernet: "bg-brand/10 text-brand",
  vlan: "bg-info/10 text-info",
  pppoe: "bg-success/10 text-success",
  bridge: "bg-muted text-muted-foreground",
  loopback: "bg-muted text-muted-foreground",
  wan: "bg-warning/10 text-warning",
};

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
};

export function InterfacesClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["interfaces", { page, pageSize, search }],
    queryFn: () => fetchInterfaces({ page, pageSize, search }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: saveInterface,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interfaces"] });
      toast.success("Interface created");
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<InterfaceItem>[]>(
    () => [
      {
        id: "name",
        header: "Interface",
        cell: ({ row }) => {
          const i = row.original;
          const Icon = TYPE_ICONS[i.type] ?? Cable;
          return (
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                i.enabled ? (TYPE_COLORS[i.type] ?? "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground opacity-50"
              )}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium font-mono">{i.name}</p>
                {i.displayName && <p className="text-xs text-muted-foreground">{i.displayName}</p>}
              </div>
            </div>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", TYPE_COLORS[row.original.type] ?? "bg-muted text-muted-foreground")}>
            {row.original.type}
          </span>
        ),
      },
      {
        id: "ip",
        header: "IP / MAC",
        cell: ({ row }) => (
          <div className="text-xs">
            {row.original.ipAddress ? (
              <p className="font-mono">{row.original.ipAddress}</p>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            {row.original.macAddress && (
              <p className="font-mono text-muted-foreground">{row.original.macAddress}</p>
            )}
          </div>
        ),
      },
      {
        id: "vlan",
        header: "VLAN / MTU",
        cell: ({ row }) => (
          <div className="text-xs">
            {row.original.vlanId ? (
              <Badge variant="outline" className="text-[10px]">VLAN {row.original.vlanId}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            <p className="text-muted-foreground mt-0.5">MTU {row.original.mtu}</p>
          </div>
        ),
      },
      {
        id: "link",
        header: "Link",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className={cn(
              "flex h-2 w-2 rounded-full",
              row.original.linkStatus === "up" ? "bg-success animate-pulse" : "bg-muted"
            )} />
            <span className="text-xs capitalize">{row.original.linkStatus}</span>
            {row.original.speedMbps && (
              <span className="text-xs text-muted-foreground">{row.original.speedMbps} Mbps</span>
            )}
          </div>
        ),
      },
      {
        id: "traffic",
        header: "Traffic ↓/↑",
        cell: ({ row }) => (
          <div className="text-xs tabular-nums">
            <p><span className="text-muted-foreground">↓</span> {formatBytes(row.original.rxBytes)}</p>
            <p><span className="text-muted-foreground">↑</span> {formatBytes(row.original.txBytes)}</p>
          </div>
        ),
      },
      {
        id: "errors",
        header: "Errors",
        cell: ({ row }) => (
          <div className={cn("text-xs tabular-nums", (row.original.rxErrors + row.original.txErrors) > 0 && "text-destructive")}>
            {(row.original.rxErrors + row.original.txErrors) > 0 ? `${row.original.rxErrors + row.original.txErrors}` : "0"}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge status={row.original.enabled ? "active" : "disabled"} label={row.original.enabled ? "Enabled" : "Disabled"} />
        ),
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="System Interfaces"
        description="Network interfaces on your routers and NAS devices with live traffic stats."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Interface
          </Button>
        }
      />

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
        searchPlaceholder="Search by name, IP, or MAC…"
        emptyMessage="No interfaces"
        emptyDescription="Interfaces will appear here when NAS devices report their status."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Interface</DialogTitle>
            <DialogDescription>
              Register a network interface on a NAS device for monitoring and configuration.
            </DialogDescription>
          </DialogHeader>
          <InterfaceForm isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate(values)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function InterfaceForm({ isSaving, onSave }: { isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    name: "",
    displayName: "",
    type: "ethernet",
    ipAddress: "",
    macAddress: "",
    vlanId: "",
    mtu: "1500",
    enabled: true,
    description: "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...form,
          vlanId: form.vlanId ? Number(form.vlanId) : undefined,
          mtu: Number(form.mtu),
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="if-name">Name *</Label>
          <Input id="if-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="ether1" required className="font-mono" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="if-display">Display Name</Label>
          <Input id="if-display" value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} placeholder="Uplink Port" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="if-type">Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
            <SelectTrigger id="if-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["ethernet", "vlan", "pppoe", "bridge", "loopback", "wan"].map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="if-mtu">MTU</Label>
          <Input id="if-mtu" type="number" min="576" max="9000" value={form.mtu} onChange={(e) => setForm((p) => ({ ...p, mtu: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="if-ip">IP Address (CIDR)</Label>
          <Input id="if-ip" value={form.ipAddress} onChange={(e) => setForm((p) => ({ ...p, ipAddress: e.target.value }))} placeholder="192.168.1.1/24" className="font-mono" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="if-mac">MAC Address</Label>
          <Input id="if-mac" value={form.macAddress} onChange={(e) => setForm((p) => ({ ...p, macAddress: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" className="font-mono" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="if-vlan">VLAN ID</Label>
        <Input id="if-vlan" type="number" min="1" max="4094" value={form.vlanId} onChange={(e) => setForm((p) => ({ ...p, vlanId: e.target.value }))} placeholder="100" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="if-desc">Description</Label>
        <Input id="if-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional notes" />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name}>
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Create interface
        </Button>
      </DialogFooter>
    </form>
  );
}
