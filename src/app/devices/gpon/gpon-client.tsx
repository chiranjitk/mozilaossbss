// =====================================================================
// GPON CLIENT — OLT fleet + splitter plant overview
// Real data from /api/v1/devices/gpon (Olt + Splitter models).
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/common/status-badge";
import { Network, Split } from "lucide-react";

interface Olt {
  id: string;
  name: string;
  ipAddress: string;
  vendor: string;
  model: string | null;
  status: string;
  totalPorts: number;
  usedPorts: number;
  utilisationPct: number;
  location: string | null;
  firmware: string | null;
}

interface Splitter {
  id: string;
  name: string;
  type: string;
  location: string | null;
  oltId: string | null;
  portNumber: number | null;
  status: string;
}

interface GponResponse {
  olts: Olt[];
  splitters: Splitter[];
  totalOlts: number;
  totalSplitters: number;
}

async function fetchGpon(): Promise<GponResponse> {
  const res = await fetch("/api/v1/devices/gpon", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load GPON infrastructure");
  const json = await res.json();
  return json.data;
}

export function GponClient() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["gpon"],
    queryFn: fetchGpon,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="GPON / OLT"
        description="Optical line terminals and passive splitter plant. Port utilisation updates every 30 seconds."
      />

      {isLoading ? (
        <LoadingState label="Loading GPON infrastructure…" />
      ) : isError ? (
        <ErrorState title="Could not load GPON infrastructure" onRetry={() => refetch()} />
      ) : !data ? (
        <ErrorState title="No data available" onRetry={() => refetch()} />
      ) : (
        <>
          {/* Fleet summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Network className="h-3.5 w-3.5" aria-hidden /> OLTs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">{data.totalOlts}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Split className="h-3.5 w-3.5" aria-hidden /> Splitters
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">{data.totalSplitters}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">Avg port utilisation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {data.olts.length > 0
                    ? Math.round(
                        data.olts.reduce((s, o) => s + o.utilisationPct, 0) / data.olts.length
                      )
                    : 0}
                  %
                </div>
              </CardContent>
            </Card>
          </div>

          {/* OLT fleet */}
          <Card>
            <CardHeader>
              <CardTitle>OLT Fleet</CardTitle>
              <CardDescription>Registered optical line terminals</CardDescription>
            </CardHeader>
            <CardContent>
              {data.olts.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                  <Network className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium">No OLTs registered</p>
                  <p className="text-sm text-muted-foreground">
                    Register OLTs via the devices API to see them here.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.olts.map((olt) => (
                    <div key={olt.id} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{olt.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{olt.ipAddress}</div>
                        </div>
                        <StatusBadge status={olt.status} />
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="capitalize">{olt.vendor}</Badge>
                        {olt.model ? <Badge variant="outline">{olt.model}</Badge> : null}
                        {olt.location ? <Badge variant="outline">{olt.location}</Badge> : null}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Ports: {olt.usedPorts}/{olt.totalPorts}
                          </span>
                          <span>{olt.utilisationPct}%</span>
                        </div>
                        <Progress value={olt.utilisationPct} aria-label={`${olt.name} port utilisation`} />
                      </div>
                      {olt.firmware ? (
                        <div className="mt-2 text-xs text-muted-foreground">Firmware: {olt.firmware}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Splitter plant */}
          <Card>
            <CardHeader>
              <CardTitle>Splitter Plant</CardTitle>
              <CardDescription>Passive optical splitters by ratio and location</CardDescription>
            </CardHeader>
            <CardContent>
              {data.splitters.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                  <Split className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium">No splitters recorded</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.splitters.map((sp) => (
                    <div key={sp.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">{sp.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {sp.location ?? "Unknown location"}
                          {sp.portNumber != null ? ` · port ${sp.portNumber}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{sp.type}</Badge>
                        <StatusBadge status={sp.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
