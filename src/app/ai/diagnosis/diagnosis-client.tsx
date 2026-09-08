// =====================================================================
// AI DIAGNOSIS CLIENT — network health analysis with LLM
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/common/metric-card";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/status-badge";
import { toast } from "sonner";
import {
  Stethoscope, Activity, Users, Wifi, AlertTriangle, DollarSign,
  Server, RefreshCw, Sparkles, Loader2, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function DiagnosisClient() {
  const queryClient = useQueryClient();
  const [diagnosis, setDiagnosis] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ai-diagnosis"],
    queryFn: async () => {
      const res = await fetch("/api/v1/ai-diagnosis", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/ai-diagnosis", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (json) => {
      setDiagnosis(json.data.diagnosis);
      toast.success("AI diagnosis complete");
    },
    onError: () => toast.error("Diagnosis failed"),
  });

  if (isLoading) return (<><PageHeader title="AI Diagnosis" /><LoadingState /></>);
  if (isError || !data) return (<><PageHeader title="AI Diagnosis" /><ErrorState onRetry={() => refetch()} /></>);

  const h = data.data.healthData;
  const status = data.data.healthStatus;
  const issues = data.data.issues ?? [];

  return (
    <>
      <PageHeader
        title="AI Diagnosis"
        description="AI-powered network health analysis. Gathers system metrics and generates actionable insights."
        actions={
          <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
            {runMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
            Run AI Diagnosis
          </Button>
        }
      />

      {/* Health status banner */}
      <Card className={cn("mb-5", status === "healthy" && "ring-1 ring-success/30", status === "warning" && "ring-1 ring-warning/30", status === "critical" && "ring-1 ring-destructive/30")}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-12 w-12 items-center justify-center rounded-md",
                status === "healthy" ? "bg-success/10 text-success" : status === "warning" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
              )}>
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold capitalize">{status} System</h2>
                <p className="text-sm text-muted-foreground">
                  {issues.length > 0 ? `${issues.length} issue(s) detected` : "All systems operating normally"}
                </p>
              </div>
            </div>
            <StatusBadge status={status === "healthy" ? "healthy" : status === "warning" ? "degraded" : "down"} />
          </div>
          {issues.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {issues.map((issue: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs text-warning border-warning/30">
                  <AlertTriangle className="mr-1 h-3 w-3" /> {issue}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Health metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <MetricCard label="Active Sessions" value={String(h.activeSessions)} icon={Wifi} accent="brand" hint={`of 100,000 capacity`} />
        <MetricCard label="Active Subscribers" value={String(h.activeSubscribers)} icon={Users} hint={`${h.suspendedSubscribers} suspended`} />
        <MetricCard label="Overdue Invoices" value={String(h.overdueInvoices)} icon={AlertTriangle} accent={h.overdueInvoices > 0 ? "warning" : "success"} />
        <MetricCard label="Revenue (24h)" value={`$${h.revenue24h?.toFixed(0) ?? 0}`} icon={DollarSign} accent="success" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-5">
        <Card className="p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /><span className="text-sm">Open Complaints</span></div><span className="text-xl font-semibold tabular-nums">{h.openComplaints}</span></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-sm">Open Incidents</span></div><span className="text-xl font-semibold tabular-nums">{h.openIncidents}</span></div></Card>
        <Card className="p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /><span className="text-sm">Active Alerts</span></div><span className="text-xl font-semibold tabular-nums">{h.activeAlerts}</span></div></Card>
      </div>

      {/* AI Diagnosis result */}
      {diagnosis && (
        <Card className="mb-5 ring-1 ring-brand/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4 text-brand" /> AI Analysis Report
            </CardTitle>
            <CardDescription>Generated by Cryptsk AI Diagnosis engine</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap text-sm font-sans bg-muted/30 rounded-md p-4">
                {diagnosis}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {runMutation.isPending && !diagnosis && (
        <Card className="mb-5">
          <CardContent className="p-8 flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
            <p className="text-sm text-muted-foreground">AI is analyzing network health…</p>
          </CardContent>
        </Card>
      )}

      {/* Architecture note */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-brand" /> How AI Diagnosis Works</p>
          <p>The system gathers real-time metrics from all modules (sessions, subscribers, billing, complaints, incidents, alerts, syslog) and sends them to the LLM (z-ai-web-dev-sdk) for analysis. If the AI service is unavailable, a rule-based fallback provides a summary. AI never blocks core platform operations.</p>
        </CardContent>
      </Card>
    </>
  );
}
