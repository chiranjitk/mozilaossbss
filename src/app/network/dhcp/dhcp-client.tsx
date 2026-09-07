// =====================================================================
// DHCP LEASES CLIENT — list, filter, search
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, formatDistanceToNow } from "date-fns";
import { Clock, Wifi, Globe, Server } from "lucide-react";
import { cn } from "@/lib/utils";

interface DhcpLease {
  id: string;
  ipAddress: string;
  macAddress: string;
  hostname: string | null;
  clientId: string | null;
  subnet: { id: string; name: string; cidrNotation: string } | null;
  leaseStart: string;
  leaseEnd: string;
  leaseTime: number;
  state: string;
}

async function fetchLeases(params: {
  page: number;
  pageSize: number;
  search: string;
  state: string;
}): Promise<{ data: DhcpLease[]; total: number }> {
  const url = new URL("/api/v1/dhcp-leases", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.state && params.state !== "all") url.searchParams.set("state", params.state);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch DHCP leases");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatRemaining = (leaseEnd: string): string => {
  const ms = new Date(leaseEnd).getTime() - Date.now();
  if (ms < 0) return "expired";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
};

export function DhcpClient() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dhcp-leases", { page, pageSize, search, stateFilter }],
    queryFn: () => fetchLeases({ page, pageSize, search, state: stateFilter }),
    placeholderData: (prev) => prev,
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<DhcpLease>[]>(
    () => [
      {
        id: "ip",
        header: "IP Address",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <code className="text-sm font-mono">{row.original.ipAddress}</code>
          </div>
        ),
      },
      {
        id: "mac",
        header: "MAC Address",
        cell: ({ row }) => (
          <code className="text-xs font-mono text-muted-foreground">{row.original.macAddress}</code>
        ),
      },
      {
        id: "hostname",
        header: "Hostname",
        cell: ({ row }) => (
          row.original.hostname ? (
            <span className="text-sm">{row.original.hostname}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        ),
      },
      {
        id: "subnet",
        header: "Subnet",
        cell: ({ row }) =>
          row.original.subnet ? (
            <div className="text-xs">
              <p>{row.original.subnet.name}</p>
              <code className="text-muted-foreground font-mono">{row.original.subnet.cidrNotation}</code>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "lease",
        header: "Lease",
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              {formatDuration(row.original.leaseTime)}
            </p>
            <p className="text-muted-foreground">
              Started {formatDistanceToNow(new Date(row.original.leaseStart), { addSuffix: true })}
            </p>
          </div>
        ),
      },
      {
        id: "remaining",
        header: "Remaining",
        cell: ({ row }) => (
          <span className={cn("text-xs tabular-nums", new Date(row.original.leaseEnd) < new Date() ? "text-destructive" : "text-muted-foreground")}>
            {formatRemaining(row.original.leaseEnd)}
          </span>
        ),
      },
      {
        accessorKey: "state",
        header: "State",
        cell: ({ row }) => <StatusBadge status={row.original.state} />,
      },
    ],
    []
  );

  return (
    <>
      <PageHeader
        title="DHCP Leases"
        description="Active and historical DHCP lease assignments across your network."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
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
        searchPlaceholder="Search by IP, MAC, hostname…"
        emptyMessage="No DHCP leases"
        emptyDescription="DHCP leases will appear here when devices obtain addresses."
      />
    </>
  );
}
