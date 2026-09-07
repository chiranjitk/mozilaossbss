// =====================================================================
// RUN BILLING CLIENT — preview + execute billing run
// =====================================================================

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, Eye, AlertTriangle, CheckCircle2, Loader2, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface BillingRunResult {
  generated: number;
  skipped: number;
  errors: Array<{ subscriberId: string; error: string }>;
  totalAmount: number;
  overdueMarked: number;
  dryRun: boolean;
}

async function runBillingApi(dryRun: boolean): Promise<BillingRunResult> {
  const res = await fetch("/api/v1/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun, markOverdue: !dryRun }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Billing run failed");
  }
  const json = await res.json();
  return json.data;
}

export function RunBillingClient() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<BillingRunResult | null>(null);

  const dryRunMutation = useMutation({
    mutationFn: () => runBillingApi(true),
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Dry run complete: ${data.generated} invoices would be generated`);
    },
    onError: (e: Error) => toast.error("Dry run failed", { description: e.message }),
  });

  const executeMutation = useMutation({
    mutationFn: () => runBillingApi(false),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Billing run complete: ${data.generated} invoices generated`);
    },
    onError: (e: Error) => toast.error("Billing run failed", { description: e.message }),
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

  return (
    <>
      <PageHeader
        title="Run Billing"
        description="Generate invoices for all active subscribers with an assigned plan. Skips subscribers with existing unpaid invoices for the current billing period."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Action panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Play className="h-4 w-4 text-brand" /> Billing Run
              </CardTitle>
              <CardDescription>
                This will scan all active subscribers, check for existing unpaid invoices
                in the current billing period, and generate new invoices for those who need them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-2">
                <p className="font-medium text-foreground">What happens during a billing run:</p>
                <ul className="space-y-1 text-muted-foreground list-disc pl-4">
                  <li>All existing issued/partial invoices past their due date are marked <span className="text-warning">overdue</span></li>
                  <li>Active subscribers with a plan are checked for existing unpaid invoices this month</li>
                  <li>Subscribers with unpaid invoices are <span className="text-muted-foreground">skipped</span> (no duplicate billing)</li>
                  <li>New invoices are generated with plan price + tax, due in 7 days</li>
                  <li>Each invoice gets a unique number (INV-YYYY-XXXX)</li>
                  <li>An audit event is recorded for the billing run</li>
                </ul>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dryRunMutation.mutate()}
                  disabled={dryRunMutation.isPending || executeMutation.isPending}
                >
                  {dryRunMutation.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-3.5 w-3.5" />
                  )}
                  Preview (Dry Run)
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (confirm("Run billing now? This will generate real invoices for all eligible subscribers.")) {
                      executeMutation.mutate();
                    }
                  }}
                  disabled={dryRunMutation.isPending || executeMutation.isPending}
                >
                  {executeMutation.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-3.5 w-3.5" />
                  )}
                  Run Billing
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {result && (
            <Card className={cn(result.dryRun ? "ring-1 ring-info/30" : "ring-1 ring-success/30")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  {result.dryRun ? (
                    <><Eye className="h-4 w-4 text-info" /> Dry Run Results</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 text-success" /> Billing Run Complete</>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stat grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-success/30 bg-success/10 p-3">
                    <p className="text-2xl font-semibold text-success tabular-nums">{result.generated}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {result.dryRun ? "Would Generate" : "Generated"}
                    </p>
                  </div>
                  <div className="rounded-md border border-muted bg-muted/20 p-3">
                    <p className="text-2xl font-semibold tabular-nums">{result.skipped}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Skipped</p>
                  </div>
                  <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                    <p className="text-2xl font-semibold text-warning tabular-nums">{result.overdueMarked}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Marked Overdue</p>
                  </div>
                  <div className="rounded-md border border-brand/30 bg-brand/10 p-3">
                    <p className="text-2xl font-semibold text-brand tabular-nums">{formatCurrency(result.totalAmount)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Amount</p>
                  </div>
                </div>

                {/* Errors */}
                {result.errors.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Errors ({result.errors.length})
                    </p>
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 max-h-40 overflow-y-auto scroll-thin">
                      <ul className="divide-y divide-border">
                        {result.errors.map((err, i) => (
                          <li key={i} className="px-3 py-1.5 text-xs">
                            <code className="font-mono text-destructive">{err.subscriberId.slice(0, 12)}…</code>
                            <span className="text-muted-foreground"> — {err.error}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {!result.dryRun && result.generated > 0 && (
                  <div className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 p-3 text-xs">
                    <DollarSign className="h-4 w-4 text-success shrink-0" />
                    <span className="text-success font-medium">
                      {result.generated} invoices generated totaling {formatCurrency(result.totalAmount)}. View them in the Invoices page.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Billing Lifecycle</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">draft</Badge>
                <span className="text-muted-foreground">→ Created but not sent</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] text-info border-info/30">issued</Badge>
                <span className="text-muted-foreground">→ Sent to subscriber</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] text-warning border-warning/30">partial</Badge>
                <span className="text-muted-foreground">→ Partially paid</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] text-success border-success/30">paid</Badge>
                <span className="text-muted-foreground">→ Fully paid</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">overdue</Badge>
                <span className="text-muted-foreground">→ Past due date</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] text-muted-foreground">cancelled</Badge>
                <span className="text-muted-foreground">→ Voided</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/20 border-dashed">
            <CardContent className="p-4 text-xs space-y-2 text-muted-foreground">
              <p className="font-medium text-foreground">Decimal-Safe Money</p>
              <p>
                All money calculations use integer cents internally to avoid floating-point errors.
                Stored as Prisma Decimal (not float). Tax calculated as subtotal × taxRate.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
