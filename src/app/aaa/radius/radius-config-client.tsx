// =====================================================================
// RADIUS CONFIG CLIENT — worker status, ports, protocol info, stats
// =====================================================================

"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/status-badge";
import { toast } from "sonner";
import {
  Server,
  Radio,
  Activity,
  Settings,
  KeyRound,
  Network,
  Zap,
  CheckCircle2,
  XCircle,
  Terminal,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkerStatus {
  running: boolean;
  status: string;
  uptime?: number;
  timestamp?: string;
}

interface WorkerDetailed {
  ok: boolean;
  service: string;
  uptime: number;
  ports: {
    auth: number;
    acct: number;
    coa: number;
    http: number;
  };
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
}

async function fetchWorkerHealth(): Promise<WorkerStatus> {
  const res = await fetch("/api/radius-worker/health", { cache: "no-store" });
  if (!res.ok) return { running: false, status: "error" };
  const json = await res.json();
  return json.data;
}

async function fetchWorkerDetailed(): Promise<WorkerDetailed | null> {
  try {
    const res = await fetch("http://localhost:3030/status", { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const formatUptime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatBytes = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
};

export function RadiusConfigClient() {
  const { data: health, isLoading, isError, refetch } = useQuery({
    queryKey: ["worker-health"],
    queryFn: fetchWorkerHealth,
    refetchInterval: 5000,
  });

  const { data: detailed } = useQuery({
    queryKey: ["worker-detailed"],
    queryFn: fetchWorkerDetailed,
    refetchInterval: 10000,
    enabled: health?.running,
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="RADIUS Configuration" description="AAA Access Gateway status and settings." />
        <LoadingState label="Loading worker status…" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="RADIUS Configuration"
        description="AAA Access Gateway status and settings. The RADIUS worker is a separate Bun process that handles the UDP protocol."
      />

      {/* Worker status hero */}
      <Card className={cn("mb-5 overflow-hidden", health?.running && "ring-1 ring-success/30")}>
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-md",
                  health?.running ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                )}
              >
                <Server className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">Cryptsk RADIUS Worker</h2>
                  <StatusBadge
                    status={health?.running ? "healthy" : "down"}
                    label={health?.running ? "Running" : "Stopped"}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {health?.running
                    ? `Uptime: ${detailed ? formatUptime(detailed.uptime) : "—"} · Service: ${detailed?.service ?? "cryptsk-radius-worker"}`
                    : "Worker is not running. Start it to enable RADIUS authentication."}
                </p>
                {health?.running && detailed && (
                  <p className="text-xs text-muted-foreground">
                    Memory: {formatBytes(detailed.memory.rss)} RSS · {formatBytes(detailed.memory.heapUsed)} heap
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <Activity className="mr-2 h-3.5 w-3.5" /> Check status
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Port configuration */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-5">
        <PortCard
          name="Authentication"
          port={detailed?.ports.auth ?? 1812}
          protocol="UDP"
          description="RADIUS Access-Request/Accept/Reject (RFC 2865)"
          icon={KeyRound}
          enabled={health?.running ?? false}
        />
        <PortCard
          name="Accounting"
          port={detailed?.ports.acct ?? 1813}
          protocol="UDP"
          description="RADIUS Accounting Start/Stop/Interim (RFC 2866)"
          icon={Activity}
          enabled={health?.running ?? false}
        />
        <PortCard
          name="CoA / Disconnect"
          port={detailed?.ports.coa ?? 3799}
          protocol="UDP"
          description="Change of Authorization & Disconnect (RFC 3576)"
          icon={Zap}
          enabled={health?.running ?? false}
        />
      </div>

      {/* Protocol info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Settings className="h-4 w-4 text-brand" /> Protocol Support
            </CardTitle>
            <CardDescription>RFC standards implemented by the RADIUS worker</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { rfc: "RFC 2865", name: "RADIUS Authentication", supported: true },
              { rfc: "RFC 2866", name: "RADIUS Accounting", supported: true },
              { rfc: "RFC 2869", name: "RADIUS Extensions (Session-Timeout, Idle-Timeout)", supported: true },
              { rfc: "RFC 3576", name: "Dynamic Authorization (CoA/Disconnect)", supported: true },
              { rfc: "RFC 3580", name: "IEEE 802.1X / EAP Support", supported: false, note: "Planned" },
              { rfc: "RFC 4675", name: "RADIUS Attributes for IEEE 802", supported: false, note: "Planned" },
            ].map((p) => (
              <div
                key={p.rfc}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <code className="text-xs text-muted-foreground font-mono">{p.rfc}</code>
                </div>
                {p.supported ? (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Supported
                  </span>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {p.note ?? "Not supported"}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-brand" /> Security
            </CardTitle>
            <CardDescription>Authentication and encryption</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Password Encryption</span>
              <span className="text-foreground">MD5 + User-Password (RFC 2865 §5.2)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Shared Secret Storage</span>
              <span className="text-foreground">Per-NAS, AES-ready</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Message-Authenticator (80)</span>
              <span className="text-foreground">HMAC-MD5 verified</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Request Authenticator</span>
              <span className="text-foreground">16-byte random</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Response Authenticator</span>
              <span className="text-foreground">MD5(code+id+len+req+attrs+secret)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Start command */}
      {!health?.running && (
        <Card className="border-dashed bg-muted/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Terminal className="h-4 w-4 text-brand" /> Start the RADIUS Worker
            </CardTitle>
            <CardDescription>
              Run this command in a terminal to start the RADIUS server:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-zinc-950 p-3 font-mono text-xs text-zinc-100 overflow-x-auto scroll-thin">
              <span className="text-muted-foreground">$ </span>
              <span>cd /home/z/my-project/mini-services/radius-server</span>
              <br />
              <span className="text-muted-foreground">$ </span>
              <span className="text-brand">bun run dev</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The worker listens on UDP 1812 (auth), 1813 (accounting), and 3799 (CoA).
              It also exposes an HTTP control API on port 3030 for status and CoA requests.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Architecture note */}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Network className="h-4 w-4 text-brand" /> Architecture
          </CardTitle>
          <CardDescription>How the RADIUS worker integrates with Cryptsk</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-xs space-y-3 text-muted-foreground">
            <p>
              <span className="text-foreground font-medium">RADIUS Worker</span> is a standalone Bun process
              (modular monolith + selective workers architecture). It:
            </p>
            <ul className="space-y-1 list-disc pl-4">
              <li>Listens on UDP 1812/1813/3799 for RADIUS packets from NAS devices</li>
              <li>Queries the same SQLite/PostgreSQL database as the web app</li>
              <li>Verifies subscriber credentials (scrypt hash)</li>
              <li>Checks subscriber status (active/suspended/terminated)</li>
              <li>Enforces plan session limits</li>
              <li>Returns Access-Accept with bandwidth attributes</li>
              <li>Creates/updates ActiveSession records from accounting packets</li>
              <li>Moves stopped sessions to SessionHistory with termination cause</li>
              <li>Exposes HTTP control API on port 3030 for CoA/disconnect</li>
            </ul>
            <p className="pt-2">
              <span className="text-foreground font-medium">Production:</span> horizontally scalable —
              run multiple worker instances behind a UDP load balancer. Active session state can be
              moved to Redis for shared state across workers.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function PortCard({
  name,
  port,
  protocol,
  description,
  icon: Icon,
  enabled,
}: {
  name: string;
  port: number;
  protocol: string;
  description: string;
  icon: typeof Server;
  enabled: boolean;
}) {
  return (
    <Card className={cn(enabled && "ring-1 ring-success/20")}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md",
              enabled ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          {enabled ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Listening
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <XCircle className="h-3 w-3" /> Not listening
            </span>
          )}
        </div>
        <h3 className="text-sm font-semibold">{name}</h3>
        <p className="text-xs text-muted-foreground mb-2">{description}</p>
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">{protocol}</code>
          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">:{port}</code>
        </div>
      </CardContent>
    </Card>
  );
}
