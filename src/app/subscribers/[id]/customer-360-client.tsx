// =====================================================================
// CUSTOMER 360 — unified subscriber view with tabs
// Profile · Active Sessions · Session History · Invoices · Payments · Complaints · Audit
// Plus lifecycle actions (suspend/reactivate/terminate) and edit.
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Pause,
  Play,
  XCircle,
  Edit,
  Mail,
  Phone,
  MapPin,
  UserCircle,
  KeyRound,
  Activity,
  History,
  ReceiptText,
  CreditCard,
  MessageSquareWarning,
  ScrollText,
  Clock,
  Wifi,
  Globe,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Customer360Data {
  subscriber: {
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
    hasPassword: boolean;
    plan: {
      id: string;
      name: string;
      code: string;
      downloadSpeed: number | null;
      uploadSpeed: number | null;
    } | null;
    metadata: string | null;
    createdAt: string;
    updatedAt: string;
  };
  summary: {
    activeSessions: number;
    totalSessions: number;
    openInvoices: number;
    totalInvoices: number;
    totalPayments: number;
    openComplaints: number;
    totalComplaints: number;
    lifetimeValue: number;
  };
  activeSessions: Array<{
    id: string;
    sessionId: string;
    nasName: string;
    nasIp: string;
    framedIp: string | null;
    mac: string | null;
    protocol: string | null;
    startTime: string;
    duration: number;
    inputOctets: number;
    outputOctets: number;
  }>;
  recentSessions: Array<{
    id: string;
    nasIp: string;
    framedIp: string | null;
    mac: string | null;
    startTime: string;
    stopTime: string | null;
    duration: number | null;
    inputOctets: number;
    outputOctets: number;
    terminationCause: string | null;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    issueDate: string;
    dueDate: string;
    total: number;
    amountPaid: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    number: string;
    amount: number;
    method: string;
    status: string;
    receivedAt: string;
  }>;
  complaints: Array<{
    id: string;
    ticketNo: string;
    subject: string;
    status: string;
    priority: string;
    assignee: string | null;
    createdAt: string;
  }>;
  auditLog: Array<{
    id: string;
    action: string;
    status: string;
    message: string | null;
    createdAt: string;
    user: string;
  }>;
}

async function fetchCustomer360(id: string): Promise<Customer360Data> {
  const res = await fetch(`/api/v1/subscribers/${id}`, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Subscriber not found");
    throw new Error("Failed to load subscriber");
  }
  const json = await res.json();
  return json.data;
}

async function lifecycleAction(id: string, action: string, reason?: string): Promise<void> {
  const res = await fetch(`/api/v1/subscribers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Failed to ${action}`);
  }
}

// Helpers
const formatDuration = (seconds: number | null): string => {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  const gb = bytes / 1e9;
  const mb = bytes / 1e6;
  const kb = bytes / 1e3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${kb.toFixed(0)} KB`;
};

const formatSpeed = (kbps: number | null): string => {
  if (!kbps) return "—";
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`;
  return `${kbps} Kbps`;
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export function Customer360Client({ subscriberId }: { subscriberId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [lifecycleTarget, setLifecycleTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery<Customer360Data>({
    queryKey: ["subscriber", subscriberId],
    queryFn: () => fetchCustomer360(subscriberId),
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: string; reason?: string }) =>
      lifecycleAction(id, action, reason),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["subscriber", subscriberId] });
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const verb = vars.action === "suspend" ? "Suspended" : vars.action === "reactivate" ? "Reactivated" : "Terminated";
      toast.success(`Subscriber ${verb.toLowerCase()}`);
      setLifecycleTarget(null);
      setReason("");
    },
    onError: (e: Error) => toast.error("Action failed", { description: e.message }),
  });

  if (isLoading) {
    return (
      <>
        <BackButton onClick={() => router.push("/subscribers")} />
        <LoadingState label="Loading customer 360°…" />
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <BackButton onClick={() => router.push("/subscribers")} />
        <ErrorState
          title="Failed to load subscriber"
          description={error?.message}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  const { subscriber: s, summary } = data;
  const initials = `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase();

  return (
    <>
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/subscribers")}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to subscribers
        </Button>
      </div>

      {/* Header card */}
      <Card className="mb-5 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-brand/15 text-brand text-lg font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold tracking-tight">{s.fullName}</h1>
                  <StatusBadge status={s.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <code className="font-mono">{s.customerId}</code>
                  {s.username && (
                    <span className="flex items-center gap-1">
                      <KeyRound className="h-3 w-3" />
                      <code className="font-mono">{s.username}</code>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {s.email && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Mail className="h-3 w-3" /> {s.email}
                    </span>
                  )}
                  {s.phone && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Phone className="h-3 w-3" /> {s.phone}
                    </span>
                  )}
                </div>
                {s.address && (
                  <p className="flex items-start gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> {s.address}
                  </p>
                )}
              </div>
            </div>

            {/* Lifecycle actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {s.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLifecycleTarget("suspend")}
                >
                  <Pause className="mr-2 h-3.5 w-3.5" /> Suspend
                </Button>
              )}
              {s.status === "suspended" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLifecycleTarget("reactivate")}
                  className="text-success hover:text-success"
                >
                  <Play className="mr-2 h-3.5 w-3.5" /> Reactivate
                </Button>
              )}
              {(s.status === "active" || s.status === "suspended") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLifecycleTarget("terminate")}
                  className="text-destructive hover:text-destructive"
                >
                  <XCircle className="mr-2 h-3.5 w-3.5" /> Terminate
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("Edit form coming soon — use the API for now")}
              >
                <Edit className="mr-2 h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          </div>

          {/* Plan + summary stats strip */}
          <div className="border-t border-border bg-muted/20 px-5 py-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              <SummaryItem
                label="Plan"
                value={s.plan?.name ?? "No plan"}
                hint={s.plan ? `${formatSpeed(s.plan.downloadSpeed)} ↓ / ${formatSpeed(s.plan.uploadSpeed)} ↑` : undefined}
              />
              <SummaryItem
                label="Active Sessions"
                value={String(summary.activeSessions)}
                accent={summary.activeSessions > 0 ? "success" : "muted"}
              />
              <SummaryItem
                label="Open Invoices"
                value={String(summary.openInvoices)}
                accent={summary.openInvoices > 0 ? "warning" : "muted"}
              />
              <SummaryItem
                label="Open Complaints"
                value={String(summary.openComplaints)}
                accent={summary.openComplaints > 0 ? "warning" : "muted"}
              />
              <SummaryItem
                label="Lifetime Value"
                value={formatCurrency(summary.lifetimeValue)}
                accent="brand"
              />
              <SummaryItem label="Total Sessions" value={String(summary.totalSessions)} />
              <SummaryItem
                label="Customer Since"
                value={format(new Date(s.createdAt), "MMM yyyy")}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 h-auto">
          <TabsTrigger value="sessions" className="text-xs">
            <Activity className="mr-1.5 h-3.5 w-3.5" /> Active
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">
            <History className="mr-1.5 h-3.5 w-3.5" /> History
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">
            <ReceiptText className="mr-1.5 h-3.5 w-3.5" /> Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">
            <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Payments
          </TabsTrigger>
          <TabsTrigger value="complaints" className="text-xs">
            <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" /> Complaints
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">
            <ScrollText className="mr-1.5 h-3.5 w-3.5" /> Audit
          </TabsTrigger>
          <TabsTrigger value="profile" className="text-xs">
            <UserCircle className="mr-1.5 h-3.5 w-3.5" /> Profile
          </TabsTrigger>
        </TabsList>

        {/* Active Sessions */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wifi className="h-4 w-4 text-brand" /> Active Sessions
                {summary.activeSessions > 0 && (
                  <Badge className="bg-success/15 text-success border-success/30">{summary.activeSessions} online</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.activeSessions.length === 0 ? (
                <EmptyRow icon={Wifi} message="No active sessions" hint="Subscriber is currently offline." />
              ) : (
                <div className="space-y-2">
                  {data.activeSessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-2 w-2 rounded-full bg-success animate-pulse" />
                        <div>
                          <p className="text-sm font-mono">{sess.sessionId}</p>
                          <p className="text-xs text-muted-foreground">
                            {sess.nasName} · {sess.nasIp}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div>
                          <p className="text-muted-foreground">IP</p>
                          <code className="font-mono">{sess.framedIp ?? "—"}</code>
                        </div>
                        <div>
                          <p className="text-muted-foreground">MAC</p>
                          <code className="font-mono">{sess.mac ?? "—"}</code>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Protocol</p>
                          <Badge variant="outline" className="text-[10px]">{sess.protocol ?? "—"}</Badge>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Duration</p>
                          <p className="font-medium">{formatDuration(sess.duration)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Data ↓/↑</p>
                          <p className="font-medium tabular-nums">
                            {formatBytes(sess.outputOctets)} / {formatBytes(sess.inputOctets)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Session History */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-brand" /> Session History
                <Badge variant="outline" className="text-[10px]">{data.recentSessions.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentSessions.length === 0 ? (
                <EmptyRow icon={History} message="No session history" hint="Sessions will appear here after the subscriber connects." />
              ) : (
                <div className="overflow-x-auto scroll-thin">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="text-left font-medium py-2 pr-3">Start</th>
                        <th className="text-left font-medium py-2 pr-3">Stop</th>
                        <th className="text-left font-medium py-2 pr-3">Duration</th>
                        <th className="text-left font-medium py-2 pr-3">IP</th>
                        <th className="text-left font-medium py-2 pr-3">MAC</th>
                        <th className="text-right font-medium py-2 pr-3">↓ Data</th>
                        <th className="text-right font-medium py-2 pr-3">↑ Data</th>
                        <th className="text-left font-medium py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentSessions.map((sess) => (
                        <tr key={sess.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 pr-3 text-xs">
                            {format(new Date(sess.startTime), "MMM d, HH:mm")}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {sess.stopTime ? format(new Date(sess.stopTime), "MMM d, HH:mm") : "—"}
                          </td>
                          <td className="py-2 pr-3">{formatDuration(sess.duration)}</td>
                          <td className="py-2 pr-3"><code className="text-xs font-mono">{sess.framedIp ?? "—"}</code></td>
                          <td className="py-2 pr-3"><code className="text-xs font-mono">{sess.mac ?? "—"}</code></td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatBytes(sess.outputOctets)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatBytes(sess.inputOctets)}</td>
                          <td className="py-2 text-xs">{sess.terminationCause ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ReceiptText className="h-4 w-4 text-brand" /> Invoices
                <Badge variant="outline" className="text-[10px]">{summary.totalInvoices} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.invoices.length === 0 ? (
                <EmptyRow icon={ReceiptText} message="No invoices" hint="Invoices will appear here once billing runs." />
              ) : (
                <div className="space-y-2">
                  {data.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border p-3 hover:bg-muted/30"
                    >
                      <div>
                        <p className="text-sm font-medium font-mono">{inv.number}</p>
                        <p className="text-xs text-muted-foreground">
                          Issued {format(new Date(inv.issueDate), "MMM d, yyyy")} · Due {format(new Date(inv.dueDate), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{formatCurrency(inv.total)}</p>
                          <p className="text-xs text-muted-foreground">Paid {formatCurrency(inv.amountPaid)}</p>
                        </div>
                        <StatusBadge status={inv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-brand" /> Payments
                <Badge variant="outline" className="text-[10px]">{summary.totalPayments} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.payments.length === 0 ? (
                <EmptyRow icon={CreditCard} message="No payments" hint="Payments will appear here once received." />
              ) : (
                <div className="space-y-2">
                  {data.payments.map((pay) => (
                    <div
                      key={pay.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border p-3 hover:bg-muted/30"
                    >
                      <div>
                        <p className="text-sm font-medium font-mono">{pay.number}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(pay.receivedAt), "MMM d, yyyy HH:mm")} · via {pay.method}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold tabular-nums">{formatCurrency(pay.amount)}</p>
                        <StatusBadge status={pay.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Complaints */}
        <TabsContent value="complaints">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MessageSquareWarning className="h-4 w-4 text-brand" /> Complaints
                <Badge variant="outline" className="text-[10px]">{summary.totalComplaints} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.complaints.length === 0 ? (
                <EmptyRow icon={MessageSquareWarning} message="No complaints" hint="Support tickets will appear here." />
              ) : (
                <div className="space-y-2">
                  {data.complaints.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border p-3 hover:bg-muted/30"
                    >
                      <div>
                        <p className="text-sm font-medium">{c.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          <code className="font-mono">{c.ticketNo}</code> · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                          {c.assignee && ` · ${c.assignee}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.priority} />
                        <StatusBadge status={c.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ScrollText className="h-4 w-4 text-brand" /> Audit History
                <Badge variant="outline" className="text-[10px]">{data.auditLog.length} events</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.auditLog.length === 0 ? (
                <EmptyRow icon={ScrollText} message="No audit events" hint="Actions on this subscriber will be recorded here." />
              ) : (
                <div className="space-y-2">
                  {data.auditLog.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 rounded-md border border-border p-2.5">
                      <StatusBadge
                        status={a.status}
                        label={a.status === "success" ? "✓" : a.status === "failure" ? "✗" : "·"}
                        className="px-1.5 py-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <code className="font-mono text-brand">{a.action}</code>
                          {a.message && <span className="text-muted-foreground"> · {a.message}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.user} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profile */}
        <TabsContent value="profile">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserCircle className="h-4 w-4 text-brand" /> Profile Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailRow label="Customer ID" value={<code className="font-mono">{s.customerId}</code>} />
                <DetailRow label="Full Name" value={s.fullName} />
                <DetailRow label="Email" value={s.email ?? "—"} />
                <DetailRow label="Phone" value={s.phone ?? "—"} />
                <DetailRow label="Address" value={s.address ?? "—"} />
                <DetailRow label="Status" value={<StatusBadge status={s.status} />} />
                <DetailRow label="RADIUS Username" value={s.username ? <code className="font-mono">{s.username}</code> : "—"} />
                <DetailRow
                  label="Password Set"
                  value={
                    <Badge variant="outline" className={s.hasPassword ? "text-success border-success/30" : "text-muted-foreground"}>
                      {s.hasPassword ? "Yes" : "No"}
                    </Badge>
                  }
                />
                <DetailRow
                  label="Plan"
                  value={
                    s.plan ? (
                      <div>
                        <p className="font-medium">{s.plan.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSpeed(s.plan.downloadSpeed)} ↓ / {formatSpeed(s.plan.uploadSpeed)} ↑
                        </p>
                      </div>
                    ) : (
                      "No plan"
                    )
                  }
                />
                <DetailRow label="Customer Since" value={format(new Date(s.createdAt), "MMM d, yyyy")} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lifecycle dialog */}
      <Dialog open={!!lifecycleTarget} onOpenChange={(o) => !o && setLifecycleTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {lifecycleTarget === "suspend" && <><Pause className="h-5 w-5 text-warning" /> Suspend subscriber</>}
              {lifecycleTarget === "reactivate" && <><Play className="h-5 w-5 text-success" /> Reactivate subscriber</>}
              {lifecycleTarget === "terminate" && <><XCircle className="h-5 w-5 text-destructive" /> Terminate subscriber</>}
            </DialogTitle>
            <DialogDescription>
              {lifecycleTarget === "suspend" && "This will trigger RADIUS CoA/Disconnect to drop active sessions."}
              {lifecycleTarget === "reactivate" && "The subscriber will be able to authenticate again immediately."}
              {lifecycleTarget === "terminate" && "This is irreversible. Active sessions will be disconnected."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Non-payment, customer request, abuse…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifecycleTarget(null)}>Cancel</Button>
            <Button
              variant={lifecycleTarget === "terminate" ? "destructive" : "default"}
              disabled={lifecycleMutation.isPending}
              onClick={() => {
                if (!lifecycleTarget) return;
                lifecycleMutation.mutate({
                  id: subscriberId,
                  action: lifecycleTarget,
                  reason: reason || undefined,
                });
              }}
            >
              {lifecycleMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {lifecycleTarget === "suspend" && "Suspend"}
              {lifecycleTarget === "reactivate" && "Reactivate"}
              {lifecycleTarget === "terminate" && "Terminate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mb-4">
      <Button variant="ghost" size="sm" onClick={onClick} className="text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to subscribers
      </Button>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  hint,
  accent = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "brand" | "success" | "warning" | "muted";
}) {
  const accentClass = {
    default: "text-foreground",
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
    muted: "text-muted-foreground",
  }[accent];

  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold truncate", accentClass)}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

function EmptyRow({
  icon: Icon,
  message,
  hint,
}: {
  icon: typeof Wifi;
  message: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        {hint && <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>}
      </div>
    </div>
  );
}
