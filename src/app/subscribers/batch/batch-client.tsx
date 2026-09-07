// =====================================================================
// BATCH PROVISIONING — paste CSV to bulk-create subscribers
// Header row: firstName,lastName,email,phone,planCode,username,password
// Up to 500 per batch.
// =====================================================================

"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Wand2,
} from "lucide-react";

interface Plan {
  id: string;
  name: string;
  code: string;
}

interface BatchResult {
  created: number;
  errors: number;
  errorDetails: Array<{ index: number; error: string }>;
  createdIds: string[];
}

async function fetchPlans(): Promise<Plan[]> {
  const res = await fetch("/api/v1/plans", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data.plans;
}

const SAMPLE_CSV = `firstName,lastName,email,phone,planCode,username,password
John,Smith,john.smith@example.com,+1 555 100 1000,PRO-100MBPS,jsmith,secret123
Jane,Doe,jane.doe@example.com,+1 555 100 1001,BASIC-50MBPS,jdoe,secret456
Bob,Johnson,bob.j@example.com,+1 555 100 1002,PRO-100MBPS,bjohnson,secret789`;

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

export function BatchClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<BatchResult | null>(null);

  const { data: plans } = useQuery<Plan[]>({ queryKey: ["plans"], queryFn: fetchPlans });

  const parsedRows = useMemo(() => (csv.trim() ? parseCSV(csv) : []), [csv]);

  const batchMutation = useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      // Map planCode → planId
      const planMap = new Map((plans ?? []).map((p) => [p.code, p.id]));
      const subscribers = rows.map((r) => ({
        firstName: r.firstName ?? r.first_name ?? "",
        lastName: r.lastName ?? r.last_name ?? "",
        email: r.email || undefined,
        phone: r.phone || undefined,
        planId: r.planCode ? planMap.get(r.planCode) : undefined,
        username: r.username || undefined,
        password: r.password || undefined,
        status: "active" as const,
      }));
      const res = await fetch("/api/v1/subscribers/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribers }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Batch failed");
      }
      return json.data as BatchResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Created ${data.created} subscriber(s)`, {
        description: data.errors > 0 ? `${data.errors} error(s) — see details below` : "All succeeded",
      });
    },
    onError: (e: Error) => {
      toast.error("Batch failed", { description: e.message });
    },
  });

  const planCodes = (plans ?? []).map((p) => p.code).join(", ");

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

      <PageHeader
        title="Batch Provisioning"
        description="Bulk create subscribers from CSV. Up to 500 per batch."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCsv(SAMPLE_CSV)}
          >
            <Wand2 className="mr-2 h-3.5 w-3.5" /> Load Sample
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* CSV input */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-brand" /> CSV Input
              </CardTitle>
              <CardDescription>
                Paste subscriber data. First line must be the header row.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="csv-input">CSV content</Label>
                <Textarea
                  id="csv-input"
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder={SAMPLE_CSV}
                  rows={14}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {parsedRows.length} row(s) parsed · max 500
                </span>
                <Button
                  size="sm"
                  disabled={parsedRows.length === 0 || batchMutation.isPending}
                  onClick={() => batchMutation.mutate(parsedRows)}
                >
                  {batchMutation.isPending ? (
                    <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Provisioning…</>
                  ) : (
                    <><Upload className="mr-2 h-3.5 w-3.5" /> Provision {parsedRows.length} subscriber(s)</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-success/30 bg-success/10 p-3">
                    <p className="text-2xl font-semibold text-success tabular-nums">{result.created}</p>
                    <p className="text-xs text-muted-foreground">Created</p>
                  </div>
                  <div className={result.errors > 0 ? "rounded-md border border-destructive/30 bg-destructive/10 p-3" : "rounded-md border border-border bg-muted/20 p-3"}>
                    <p className={`text-2xl font-semibold tabular-nums ${result.errors > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {result.errors}
                    </p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>

                {result.errorDetails.length > 0 && (
                  <div className="rounded-md border border-border max-h-60 overflow-y-auto scroll-thin">
                    <p className="text-xs font-medium px-3 py-2 border-b border-border bg-muted/30">
                      Error details
                    </p>
                    <ul className="divide-y divide-border">
                      {result.errorDetails.map((err, i) => (
                        <li key={i} className="flex items-start gap-2 px-3 py-2 text-xs">
                          <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium">Row {err.index + 2}:</span>{" "}
                            <span className="text-muted-foreground">{err.error}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/subscribers")}
                >
                  View all subscribers
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Help */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">CSV Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <p className="font-medium mb-1">Required columns</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li><code className="font-mono text-foreground">firstName</code></li>
                  <li><code className="font-mono text-foreground">lastName</code></li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Optional columns</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li><code className="font-mono text-foreground">email</code></li>
                  <li><code className="font-mono text-foreground">phone</code></li>
                  <li><code className="font-mono text-foreground">planCode</code></li>
                  <li><code className="font-mono text-foreground">username</code> (auto-generated if blank)</li>
                  <li><code className="font-mono text-foreground">password</code> (min 6 chars)</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">Available plan codes</p>
                <div className="flex flex-wrap gap-1.5">
                  {(plans ?? []).map((p) => (
                    <Badge key={p.code} variant="outline" className="text-[10px] font-mono">
                      {p.code}
                    </Badge>
                  ))}
                  {plans?.length === 0 && (
                    <span className="text-muted-foreground">No plans yet</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/20 border-dashed">
            <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Notes</p>
              <ul className="space-y-1 list-disc pl-4">
                <li>Duplicate usernames/customerIds are skipped</li>
                <li>Invalid plan codes are skipped</li>
                <li>Subscribers are created with status <code className="font-mono">active</code></li>
                <li>Maximum 500 per batch</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
