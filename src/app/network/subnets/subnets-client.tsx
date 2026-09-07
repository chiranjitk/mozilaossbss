// =====================================================================
// SUBNETS CLIENT — redirects to IPAM (subnets are the same data)
// Shows a detailed subnet list with utilization visualization
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
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
import { toast } from "sonner";
import {
  Share2 as SubnetIcon,
  Activity,
  Gauge,
  Network,
  RefreshCw,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

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

async function fetchSubnets(params: { search: string; status: string }): Promise<SubnetItem[]> {
  const url = new URL("/api/v1/subnets", window.location.origin);
  url.searchParams.set("pageSize", "100");
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch subnets");
  const json = await res.json();
  return json.data;
}

const TYPE_COLORS: Record<string, string> = {
  data: "bg-brand/10 text-brand",
  voice: "bg-info/10 text-info",
  management: "bg-success/10 text-success",
  guest: "bg-warning/10 text-warning",
  pppoe: "bg-muted text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  data: "Data",
  voice: "Voice",
  management: "Management",
  guest: "Guest",
  pppoe: "PPPoE",
};

function getUtilColor(pct: number): string {
  if (pct >= 90) return "bg-destructive";
  if (pct >= 70) return "bg-warning";
  if (pct >= 30) return "bg-success";
  return "bg-brand";
}

export function SubnetsClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: subnets, isLoading, isError, refetch } = useQuery({
    queryKey: ["subnets-grid", { search, statusFilter }],
    queryFn: () => fetchSubnets({ search, status: statusFilter }),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Subnets" description="Visual subnet management with utilization tracking." />
        <LoadingState label="Loading subnets…" />
      </>
    );
  }

  if (isError || !subnets) {
    return (
      <>
        <PageHeader title="Subnets" description="Visual subnet management with utilization tracking." />
        <ErrorState onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Subnets"
        description="Visual subnet management with utilization tracking."
        actions={
          <Button size="sm" onClick={() => router.push("/network/ipam")}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Subnet
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subnets…"
          className="h-9 w-full sm:max-w-xs rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="exhausted">Exhausted</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-auto">
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {subnets.length === 0 ? (
        <EmptyState
          title="No subnets"
          description="Create your first subnet in the IPAM page."
          action={
            <Button size="sm" onClick={() => router.push("/network/ipam")}>
              <Plus className="mr-2 h-3.5 w-3.5" /> New Subnet
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subnets.map((s) => (
            <Card key={s.id} className={cn("hover:shadow-md transition-shadow cursor-pointer", s.status === "active" && "ring-1 ring-brand/20")}>
              <CardContent className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", TYPE_COLORS[s.type] ?? TYPE_COLORS.data)}>
                      <SubnetIcon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate">{s.name}</h3>
                      <code className="text-xs text-muted-foreground font-mono">{s.cidrNotation}</code>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                {/* Type badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium", TYPE_COLORS[s.type] ?? TYPE_COLORS.data)}>
                    {TYPE_LABELS[s.type] ?? s.type}
                  </span>
                  {s.vlanId && (
                    <Badge variant="outline" className="text-[10px]">VLAN {s.vlanId}</Badge>
                  )}
                </div>

                {/* Utilization bar */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Utilization</span>
                    <span className="tabular-nums font-medium">{s.utilization.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", getUtilColor(s.utilization))}
                      style={{ width: `${Math.min(s.utilization, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                    <span>{s.allocatedCount} allocated</span>
                    <span>{s.usableAddresses} usable</span>
                    <span>{s.totalAddresses} total</span>
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Gateway</p>
                    <p className="font-mono">{s.gateway ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">DHCP Leases</p>
                    <p className="flex items-center gap-1">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      {s.activeDhcpLeases} active
                    </p>
                  </div>
                </div>

                {s.description && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{s.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
