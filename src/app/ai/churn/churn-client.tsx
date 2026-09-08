// =====================================================================
// CHURN PREDICTION CLIENT — risk scoring + subscriber analysis
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { TrendingDown, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChurnItem {
  id: string; subscriberId: string | null;
  subscriber: { customerId: string; name: string; status: string; planName: string | null } | null;
  riskScore: number; riskLevel: string; factors: string[];
  recommendation: string | null; evaluatedAt: string;
}

const RISK_COLORS: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high: "bg-warning/10 text-warning border-warning/30",
  medium: "bg-info/10 text-info border-info/30",
  low: "bg-success/10 text-success border-success/30",
};

const getRiskColor = (score: number) => {
  if (score >= 70) return "text-destructive";
  if (score >= 50) return "text-warning";
  if (score >= 30) return "text-info";
  return "text-success";
};

async function fetchChurn(params: { page: number; pageSize: number; riskLevel: string }): Promise<{ data: ChurnItem[]; total: number }> {
  const url = new URL("/api/v1/ai-churn", window.location.origin);
  url.searchParams.set("page", String(params.page)); url.searchParams.set("pageSize", String(params.pageSize));
  if (params.riskLevel && params.riskLevel !== "all") url.searchParams.set("riskLevel", params.riskLevel);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json(); return { data: json.data, total: json.meta.total };
}

export function ChurnClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [riskFilter, setRiskFilter] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["churn", { page, pageSize, riskFilter }],
    queryFn: () => fetchChurn({ page, pageSize, riskLevel: riskFilter }),
    placeholderData: (prev) => prev,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/ai-churn?action=analyze", { method: "GET" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (json) => {
      queryClient.invalidateQueries({ queryKey: ["churn"] });
      toast.success("Churn analysis complete", { description: json.data.message });
    },
    onError: () => toast.error("Analysis failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setPage(1); }, []);

  const columns = useMemo<ColumnDef<ChurnItem>[]>(() => [
    { id: "subscriber", header: "Subscriber", cell: ({ row }) => row.original.subscriber ? <div><p className="text-sm font-medium">{row.original.subscriber.name}</p><code className="text-xs text-muted-foreground font-mono">{row.original.subscriber.customerId}</code></div> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "plan", header: "Plan", cell: ({ row }) => row.original.subscriber?.planName ? <Badge variant="outline" className="text-xs">{row.original.subscriber.planName}</Badge> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "score", header: "Risk Score", cell: ({ row }) => <div className="flex items-center gap-2"><span className={cn("text-lg font-bold tabular-nums", getRiskColor(row.original.riskScore))}>{row.original.riskScore}</span><div className="h-2 w-16 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", row.original.riskScore >= 70 ? "bg-destructive" : row.original.riskScore >= 50 ? "bg-warning" : row.original.riskScore >= 30 ? "bg-info" : "bg-success")} style={{ width: `${row.original.riskScore}%` }} /></div></div> },
    { id: "level", header: "Risk Level", cell: ({ row }) => <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize", RISK_COLORS[row.original.riskLevel] ?? "bg-muted")}>{row.original.riskLevel}</span> },
    { id: "factors", header: "Risk Factors", cell: ({ row }) => <div className="flex flex-wrap gap-1 max-w-xs">{row.original.factors.map((f, i) => <Badge key={i} variant="outline" className="text-[10px] font-normal py-0">{f}</Badge>)}</div> },
    { id: "recommendation", header: "Recommendation", cell: ({ row }) => <p className="text-xs text-muted-foreground line-clamp-2 max-w-xs">{row.original.recommendation ?? "—"}</p> },
    { id: "evaluated", header: "Evaluated", cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(row.original.evaluatedAt), { addSuffix: true })}</span> },
  ], []);

  const highRisk = data?.data.filter((d) => d.riskLevel === "high" || d.riskLevel === "critical").length ?? 0;
  const mediumRisk = data?.data.filter((d) => d.riskLevel === "medium").length ?? 0;
  const lowRisk = data?.data.filter((d) => d.riskLevel === "low").length ?? 0;

  return (
    <>
      <PageHeader title="Churn Prediction" description="AI-powered subscriber churn risk analysis. Scores based on overdue invoices, session inactivity, complaints, and suspension status." actions={
        <Button size="sm" onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>
          {analyzeMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Run Analysis
        </Button>
      } />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><TrendingDown className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Analyzed</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive"><AlertTriangle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{highRisk}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">High/Critical</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info"><AlertTriangle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{mediumRisk}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Medium Risk</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{lowRisk}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Low Risk</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={riskFilter} onValueChange={(v) => { setRiskFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Risk Level" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All risk levels</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search="" onSearchChange={handleSearchChange} searchPlaceholder="Search…" emptyMessage="No churn predictions" emptyDescription="Run analysis to evaluate subscriber churn risk." />

      <Card className="mt-5 bg-muted/20 border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-brand" /> Risk Scoring Model</p>
          <ul className="space-y-1 list-disc pl-4">
            <li>Overdue invoices: +30 points</li>
            <li>Partial payments: +15 points</li>
            <li>No session in 7+ days: +20 points</li>
            <li>Open complaints: +10 points each (max 20)</li>
            <li>Suspended status: +25 points</li>
            <li>Score capped at 100. Levels: Low (0-29), Medium (30-49), High (50-69), Critical (70-100)</li>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
