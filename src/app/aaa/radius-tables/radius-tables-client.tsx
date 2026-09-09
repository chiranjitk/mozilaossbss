// =====================================================================
// FREERADIUS TABLES CLIENT — live view of the policy→RADIUS sync output
// Tabs: radgroupreply · radgroupcheck · radusergroup · radcheck
// Shows exactly what the RADIUS server reads at Access-Request time.
// =====================================================================

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, RefreshCw, ShieldCheck } from "lucide-react";

interface TableRow {
  id: string;
  key: string;
  attribute: string;
  op: string;
  value: string;
  priority?: number;
}

interface RadiusTablesResponse {
  table: string;
  rows: TableRow[];
  counts: Record<string, number>;
}

const TABS = [
  { id: "radgroupreply", label: "Group Reply", description: "Authorization attributes pushed to sessions (rate limits, bandwidth, timeouts)" },
  { id: "radgroupcheck", label: "Group Check", description: "Group-level constraints (Simultaneous-Use, Login-Time)" },
  { id: "radusergroup", label: "User Groups", description: "Subscriber → policy group mapping resolved at auth time" },
  { id: "radcheck", label: "User Check", description: "Per-user auth rows (Cleartext-Password provisioning)" },
] as const;

async function fetchTables(table: string, q: string): Promise<RadiusTablesResponse> {
  const params = new URLSearchParams({ table });
  if (q) params.set("q", q);
  const res = await fetch(`/api/v1/aaa/radius-tables?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load RADIUS tables");
  const json = await res.json();
  return json.data;
}

export function RadiusTablesClient() {
  const [table, setTable] = useState<string>("radgroupreply");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["radius-tables", table, search],
    queryFn: () => fetchTables(table, search),
  });

  const activeTab = TABS.find((t) => t.id === table);

  return (
    <div className="space-y-6">
      <PageHeader
        title="FreeRADIUS Tables"
        description="Live view of the tables the RADIUS server reads at Access-Request time. Policy objects (bandwidth, QoS, time access) sync here automatically."
        icon={Database}
      />

      {/* Sync health summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {data
          ? Object.entries(data.counts).map(([name, count]) => (
              <Card key={name}>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-mono">{name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums">{count}</div>
                </CardContent>
              </Card>
            ))
          : null}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
              {activeTab?.label}
            </CardTitle>
            <CardDescription>{activeTab?.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-40"
              aria-label="Search rows"
            />
            <button
              onClick={() => refetch()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent"
              aria-label="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tab bar */}
          <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={table === t.id}
                onClick={() => setTable(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  table === t.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <LoadingState label="Loading tables…" />
          ) : isError ? (
            <ErrorState message="Could not load RADIUS tables" onRetry={() => refetch()} />
          ) : !data || data.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <Database className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">No rows</p>
              <p className="text-sm text-muted-foreground">
                Policy profiles sync here when created or updated in the Policy module.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>{table === "radusergroup" ? "Username" : "Group / User"}</TableHead>
                    <TableHead>Attribute</TableHead>
                    <TableHead>Op</TableHead>
                    <TableHead className="min-w-48">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.key}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {r.attribute}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.op}</TableCell>
                      <TableCell className="font-mono text-xs">{r.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
