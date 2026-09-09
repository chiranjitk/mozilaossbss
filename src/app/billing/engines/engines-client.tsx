// =====================================================================
// ENGINES CONTROL CENTER
// Unified operator console for the production-grade business-logic engines:
//   1. Policy Engine      — evaluate + enforce effective policy per subscriber
//   2. FUP Monitor        — fair-usage-policy utilization + throttle status
//   3. Proration          — mid-cycle plan-change proration calculator
//   4. Dunning            — failed-payment retry queue + escalation
//   5. Tax Engine         — jurisdiction-aware tax config + calculator
//   6. AR Aging           — accounts-receivable aging buckets
//   7. Prepaid Wallet     — wallet top-up / debit / bulk run
// =====================================================================

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ShieldCheck,
  Gauge,
  CalendarRange,
  RotateCcw,
  Receipt,
  Wallet,
  TrendingDown,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Banknote,
  Calculator,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------
// Shared fetch helpers
// ---------------------------------------------------------------------
async function api<T>(
  url: string,
  opts?: RequestInit
): Promise<T> {
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

// =====================================================================
// 1. POLICY ENGINE TAB
// =====================================================================
interface EffectivePolicy {
  subscriberId: string;
  customerId: string;
  username: string | null;
  planName: string | null;
  accountStatus: string;
  enforcement: "allow" | "throttle" | "time_block" | "block";
  rateLimit: { downloadKbps: number; uploadKbps: number };
  qos: { priority: number; dscp: number | null };
  timeAccess: { allowed: boolean; reason: string; profileName?: string };
  fup: {
    applicable: boolean;
    capMb: number | null;
    usedMb: number;
    utilizationPct: number;
    throttled: boolean;
  };
  radiusGroup: string | null;
  summary: string;
}

function PolicyEngineTab() {
  const [subId, setSubId] = useState("");
  const [policy, setPolicy] = useState<EffectivePolicy | null>(null);

  const evalMut = useMutation({
    mutationFn: () =>
      api<EffectivePolicy>(`/api/v1/policy/evaluate?subscriberId=${encodeURIComponent(subId)}`),
    onSuccess: setPolicy,
    onError: (e: Error) => toast.error("Policy evaluation failed", { description: e.message }),
  });

  const enforceMut = useMutation({
    mutationFn: () =>
      api<{ policy: EffectivePolicy; enforcement: { dispatched: number; attributes: Record<string,string> } }>(
        "/api/v1/policy/evaluate",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId: subId }) }
      ),
    onSuccess: (data) => {
      setPolicy(data.policy);
      toast.success(`Policy enforced — ${data.enforcement.dispatched} CoA dispatched to active sessions`);
    },
    onError: (e: Error) => toast.error("Enforcement failed", { description: e.message }),
  });

  const reconcileMut = useMutation({
    mutationFn: () => api<{ evaluated: number; enforced: number; blocked: number; throttled: number }>("/api/v1/policy/apply", { method: "POST" }),
    onSuccess: (d) => toast.success(`Reconciliation complete`, { description: `${d.evaluated} evaluated · ${d.enforced} enforced (${d.blocked} blocked, ${d.throttled} throttled)` }),
    onError: (e: Error) => toast.error("Reconciliation failed", { description: e.message }),
  });

  const enforcementColor: Record<EffectivePolicy["enforcement"], string> = {
    allow: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    throttle: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    time_block: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
    block: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Policy Evaluation Engine</CardTitle>
          <CardDescription>
            Resolves the effective policy for a subscriber — merging plan defaults, bandwidth profile, QoS, time-access, FUP throttling and account status — into a single enforceable descriptor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid w-full gap-1.5">
              <Label htmlFor="sub-id">Subscriber ID</Label>
              <Input id="sub-id" placeholder="cmo..." value={subId} onChange={(e) => setSubId(e.target.value)} />
            </div>
            <Button variant="outline" disabled={!subId || evalMut.isPending} onClick={() => evalMut.mutate()}>
              {evalMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
              Evaluate
            </Button>
            <Button disabled={!subId || enforceMut.isPending} onClick={() => enforceMut.mutate()}>
              {enforceMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Enforce via CoA
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
            <div className="text-sm text-muted-foreground">
              Bulk reconciliation — evaluate &amp; enforce policy for <strong>all active subscribers</strong>. Use nightly.
            </div>
            <Button variant="secondary" size="sm" disabled={reconcileMut.isPending} onClick={() => reconcileMut.mutate()}>
              {reconcileMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Reconcile All
            </Button>
          </div>
        </CardContent>
      </Card>

      {policy && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Effective Policy — {policy.customerId}</span>
              <Badge className={enforcementColor[policy.enforcement]}>{policy.enforcement.toUpperCase()}</Badge>
            </CardTitle>
            <CardDescription>{policy.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Download" value={`${(policy.rateLimit.downloadKbps/1000).toFixed(1)} Mbps`} />
            <Metric label="Upload" value={`${(policy.rateLimit.uploadKbps/1000).toFixed(1)} Mbps`} />
            <Metric label="QoS Priority" value={`P${policy.qos.priority}`} hint={policy.qos.dscp !== null ? `DSCP ${policy.qos.dscp}` : undefined} />
            <Metric label="RADIUS Group" value={policy.radiusGroup ?? "—"} />
            <Metric
              label="FUP Status"
              value={policy.fup.applicable ? `${policy.fup.utilizationPct.toFixed(0)}% of ${policy.fup.capMb}MB` : "No cap"}
              hint={policy.fup.throttled ? "THROTTLED" : undefined}
              hintTone={policy.fup.throttled ? "warn" : undefined}
            />
            <Metric label="Time Access" value={policy.timeAccess.allowed ? "Allowed" : "Blocked"} hint={policy.timeAccess.profileName} hintTone={policy.timeAccess.allowed ? "ok" : "warn"} />
            <Metric label="Account" value={policy.accountStatus} hintTone={policy.accountStatus === "active" ? "ok" : "warn"} />
            <Metric label="Username" value={policy.username ?? "—"} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// 2. FUP MONITOR TAB
// =====================================================================
interface FupRow {
  subscriberId: string;
  customerId: string;
  name: string;
  username: string | null;
  planName: string | null;
  capMb: number | null;
  usedMb: number;
  utilizationPct: number;
  throttled: boolean;
}
interface FupSummary { total: number; throttled: number; approaching: number; subscribers: FupRow[]; }

function FupTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["fup"],
    queryFn: () => api<FupSummary>("/api/v1/policy/fup"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary" /> Fair Usage Policy Monitor</span>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
          <CardDescription>Subscribers on data-capped plans, sorted by utilization. Throttled subscribers are surfaced first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Total Capped" value={String(data?.total ?? 0)} />
            <Metric label="Throttled" value={String(data?.throttled ?? 0)} hintTone={data && data.throttled > 0 ? "warn" : "ok"} />
            <Metric label="Approaching (≥80%)" value={String(data?.approaching ?? 0)} hintTone={data && data.approaching > 0 ? "warn" : "ok"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr className="text-left">
                  <th className="p-3 font-medium">Subscriber</th>
                  <th className="p-3 font-medium">Plan</th>
                  <th className="p-3 font-medium text-right">Used / Cap</th>
                  <th className="p-3 font-medium text-right">Utilization</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                )}
                {data?.subscribers.length === 0 && !isLoading && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No subscribers on capped plans.</td></tr>
                )}
                {data?.subscribers.map((s) => (
                  <tr key={s.subscriberId} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.customerId}{s.username ? ` · ${s.username}` : ""}</div>
                    </td>
                    <td className="p-3 text-muted-foreground">{s.planName ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{s.usedMb} / {s.capMb ?? "∞"} MB</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${s.throttled ? "bg-red-500" : s.utilizationPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, s.utilizationPct)}%` }} />
                        </div>
                        <span className="tabular-nums text-xs w-10 text-right">{s.utilizationPct}%</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {s.throttled ? <Badge variant="destructive">Throttled</Badge> : s.utilizationPct >= 80 ? <Badge variant="secondary">Approaching</Badge> : <Badge variant="outline">Normal</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// 3. PRORATION TAB
// =====================================================================
interface ProrationResult {
  oldPlanName: string | null; newPlanName: string;
  daysInCycle: number; daysElapsed: number; daysRemaining: number;
  oldPrice: number; newPrice: number;
  oldCredit: number; newCharge: number; netAdjustment: number;
  creditNoteNumber?: string; invoiceLineItemId?: string; currency: string;
}

function ProrationTab() {
  const [subscriberId, setSubscriberId] = useState("");
  const [newPlanId, setNewPlanId] = useState("");
  const [result, setResult] = useState<ProrationResult | null>(null);

  const dryRunMut = useMutation({
    mutationFn: () =>
      api<ProrationResult>(`/api/v1/billing/proration?subscriberId=${encodeURIComponent(subscriberId)}&newPlanId=${encodeURIComponent(newPlanId)}`),
    onSuccess: setResult,
    onError: (e: Error) => toast.error("Proration preview failed", { description: e.message }),
  });
  const applyMut = useMutation({
    mutationFn: () =>
      api<ProrationResult>("/api/v1/billing/proration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId, newPlanId }) }),
    onSuccess: (d) => { setResult(d); toast.success(`Plan changed: ${d.oldPlanName} → ${d.newPlanName}`); },
    onError: (e: Error) => toast.error("Proration apply failed", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5 text-primary" /> Proration Engine</CardTitle>
          <CardDescription>
            Compute the prorated credit for the unused old plan + charge for the remaining new plan. Issues a credit note or invoice line item automatically — no double-charging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Subscriber ID</Label><Input value={subscriberId} onChange={(e) => setSubscriberId(e.target.value)} placeholder="cmo..." /></div>
            <div className="grid gap-1.5"><Label>New Plan ID</Label><Input value={newPlanId} onChange={(e) => setNewPlanId(e.target.value)} placeholder="cmo..." /></div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!subscriberId || !newPlanId || dryRunMut.isPending} onClick={() => dryRunMut.mutate()}>
              {dryRunMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />} Preview
            </Button>
            <Button disabled={!subscriberId || !newPlanId || applyMut.isPending} onClick={() => applyMut.mutate()}>
              {applyMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Apply Plan Change
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Proration Result — {result.oldPlanName ?? "—"} → {result.newPlanName}</CardTitle>
            <CardDescription>
              Cycle: {result.daysRemaining}/{result.daysInCycle} days remaining ({result.daysElapsed} elapsed)
              {result.creditNoteNumber ? ` · Credit note ${result.creditNoteNumber}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Old Price" value={`${result.currency} ${result.oldPrice.toFixed(2)}`} />
            <Metric label="New Price" value={`${result.currency} ${result.newPrice.toFixed(2)}`} />
            <Metric label="Old Credit" value={`${result.currency} ${result.oldCredit.toFixed(2)}`} hint="unused portion" />
            <Metric label="New Charge" value={`${result.currency} ${result.newCharge.toFixed(2)}`} hint="remaining portion" />
            <Metric
              label="Net Adjustment"
              value={`${result.currency} ${result.netAdjustment.toFixed(2)}`}
              hint={result.netAdjustment >= 0 ? "subscriber owes" : "refund due"}
              hintTone={result.netAdjustment >= 0 ? "warn" : "ok"}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// 4. DUNNING TAB
// =====================================================================
interface DunningPreview {
  total: number; dueNow: number;
  invoices: Array<{ invoiceId: string; invoiceNumber: string; subscriberName: string | null; outstanding: number; dueDate: string; nextRetryAt: string; dueNow: boolean; attempts: number }>;
}
interface DunningResult { processed: number; succeeded: number; failed: number; suspended: number; collectionsCreated: number; }

function DunningTab() {
  const { data, isLoading, refetch } = useQuery<DunningPreview>({
    queryKey: ["dunning"],
    queryFn: () => api<DunningPreview>("/api/v1/billing/dunning"),
  });
  const runMut = useMutation({
    mutationFn: () => api<DunningResult>("/api/v1/billing/dunning", { method: "POST" }),
    onSuccess: (d) => { toast.success("Dunning cycle complete", { description: `${d.succeeded} recovered · ${d.failed} failed · ${d.suspended} suspended` }); refetch(); },
    onError: (e: Error) => toast.error("Dunning run failed", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" /> Dunning Engine</span>
            <Button size="sm" disabled={runMut.isPending} onClick={() => runMut.mutate()}>
              {runMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Run Dunning Cycle
            </Button>
          </CardTitle>
          <CardDescription>
            Failed-payment retry lifecycle: Day 0/3/7 retry charges, Day 14 auto-suspend, Day 30 escalate to collections.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Metric label="In Dunning" value={String(data?.total ?? 0)} />
          <Metric label="Due Now" value={String(data?.dueNow ?? 0)} hintTone={data && data.dueNow > 0 ? "warn" : "ok"} />
          <Metric label="Schedule" value="0 · 3 · 7 · 14 · 30d" hint="retry then escalate" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr className="text-left">
                  <th className="p-3 font-medium">Invoice</th>
                  <th className="p-3 font-medium">Subscriber</th>
                  <th className="p-3 font-medium text-right">Outstanding</th>
                  <th className="p-3 font-medium">Due Date</th>
                  <th className="p-3 font-medium text-right">Attempts</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
                {data?.invoices.length === 0 && !isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No invoices in dunning. All clear.</td></tr>}
                {data?.invoices.map((inv) => (
                  <tr key={inv.invoiceId} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{inv.invoiceNumber}</td>
                    <td className="p-3 text-muted-foreground">{inv.subscriberName ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">${inv.outstanding.toFixed(2)}</td>
                    <td className="p-3 text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="p-3 text-right tabular-nums">{inv.attempts}</td>
                    <td className="p-3">{inv.dueNow ? <Badge variant="destructive">Due Now</Badge> : <Badge variant="outline">Scheduled</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// 5. TAX ENGINE TAB
// =====================================================================
interface TaxSettings { jurisdiction: string; ratePct: number; tenantState: string | null; }
interface TaxResult { jurisdiction: string; baseAmount: number; taxLines: Array<{ label: string; ratePct: number; taxAmount: number }>; totalTax: number; grandTotal: number; taxExempt: boolean; interState: boolean; currency: string; }

function TaxTab() {
  const { data, refetch } = useQuery<TaxSettings>({ queryKey: ["tax"], queryFn: () => api<TaxSettings>("/api/v1/billing/tax") });
  const [jur, setJur] = useState("none");
  const [rate, setRate] = useState(18);
  const [state, setState] = useState("");
  const [calcAmount, setCalcAmount] = useState(1000);
  const [calcResult, setCalcResult] = useState<TaxResult | null>(null);

  // Sync loaded tax settings into the form so the operator sees the persisted config.
  // Uses the "store info from previous render" pattern (React docs) instead of an
  // effect, to avoid cascading renders.
  const [lastLoaded, setLastLoaded] = useState<TaxSettings | null | undefined>(undefined);
  if (data !== lastLoaded) {
    setLastLoaded(data);
    if (data) {
      setJur(data.jurisdiction ?? "none");
      setRate(data.ratePct ?? 0);
      setState(data.tenantState ?? "");
    }
  }

  const saveMut = useMutation({
    mutationFn: () => api("/api/v1/billing/tax", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jurisdiction: jur, ratePct: rate, tenantState: state || undefined }) }),
    onSuccess: () => { toast.success("Tax settings saved"); refetch(); },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });
  const calcMut = useMutation({
    mutationFn: () => api<TaxResult>("/api/v1/billing/tax", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseAmount: calcAmount }) }),
    onSuccess: setCalcResult,
    onError: (e: Error) => toast.error("Calculation failed", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> Tax Engine</CardTitle>
          <CardDescription>
            Jurisdiction-aware tax calculation: India GST (CGST+SGST / IGST), EU/UK VAT, US Sales Tax. Tax-exempt subscribers are skipped automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Jurisdiction</Label>
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={jur} onChange={(e) => setJur(e.target.value)}>
                <option value="none">None (tax-free)</option>
                <option value="in_gst">India — GST</option>
                <option value="eu_vat">EU — VAT</option>
                <option value="uk_vat">UK — VAT</option>
                <option value="us_sales">US — Sales Tax</option>
              </select>
            </div>
            <div className="grid gap-1.5"><Label>Rate (%)</Label><Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
            <div className="grid gap-1.5"><Label>Tenant State (GST)</Label><Input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. MH" /></div>
          </div>
          <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Save Settings
          </Button>
          {data && <p className="text-xs text-muted-foreground">Current: <strong>{data.jurisdiction}</strong> @ {data.ratePct}%{data.tenantState ? ` (state ${data.tenantState})` : ""}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tax Calculator</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="grid w-48 gap-1.5"><Label>Base Amount</Label><Input type="number" value={calcAmount} onChange={(e) => setCalcAmount(Number(e.target.value))} /></div>
            <Button variant="outline" disabled={calcMut.isPending} onClick={() => calcMut.mutate()}>
              {calcMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />} Calculate
            </Button>
          </div>
          {calcResult && (
            <div className="rounded-lg border p-3 space-y-2 text-sm">
              {calcResult.taxLines.length === 0 ? (
                <p className="text-muted-foreground">No tax applicable ({calcResult.jurisdiction}).</p>
              ) : (
                calcResult.taxLines.map((l) => (
                  <div key={l.label} className="flex justify-between">
                    <span>{l.label} ({l.ratePct}%)</span>
                    <span className="tabular-nums">{formatCurrency(l.taxAmount, calcResult.currency)}</span>
                  </div>
                ))
              )}
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Base</span><span className="tabular-nums">{formatCurrency(calcResult.baseAmount, calcResult.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Tax</span><span className="tabular-nums">{formatCurrency(calcResult.totalTax, calcResult.currency)}</span></div>
              <Separator />
              <div className="flex justify-between font-semibold"><span>Grand Total</span><span className="tabular-nums">{formatCurrency(calcResult.grandTotal, calcResult.currency)}</span></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// 6. AR AGING TAB
// =====================================================================
interface ArReport {
  asOf: string; currency: string;
  buckets: Array<{ label: string; invoiceCount: number; totalAmount: number; subscribers: number }>;
  totalOutstanding: number; totalInvoices: number; totalSubscribers: number;
  atRiskAmount: number; atRiskPct: number;
}

function ArAgingTab() {
  const { data, isLoading, refetch } = useQuery<ArReport>({ queryKey: ["ar-aging"], queryFn: () => api<ArReport>("/api/v1/billing/aging") });

  const fmt = (n: number) => data ? formatCurrency(n, data.currency) : formatCurrency(n);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><TrendingDown className="h-5 w-5 text-primary" /> AR Aging Report</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </CardTitle>
        <CardDescription>Outstanding invoice balances bucketed by age from due date.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Total Outstanding" value={fmt(data.totalOutstanding)} />
              <Metric label="Total Invoices" value={String(data.totalInvoices)} />
              <Metric label="Total Subscribers" value={String(data.totalSubscribers)} />
              <Metric label="At Risk (61+ days)" value={fmt(data.atRiskAmount)} hint={`${data.atRiskPct}% of AR`} hintTone={data.atRiskPct > 25 ? "warn" : "ok"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.buckets.map((b, i) => {
                const tone = i >= 2 ? "warn" : "ok";
                return (
                  <div key={b.label} className={`rounded-lg border p-4 ${i >= 2 ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : ""}`}>
                    <div className="text-xs font-medium text-muted-foreground">{b.label}</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{fmt(b.totalAmount)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{b.invoiceCount} invoices · {b.subscribers} subscribers</div>
                    {tone === "warn" && b.totalAmount > 0 && <AlertTriangle className="mt-2 h-4 w-4 text-amber-500" />}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// 7. PREPAID WALLET TAB
// =====================================================================
interface Wallet {
  subscriberId: string; customerId: string; balance: number; currency: string;
  lastTopUpAt: string | null; autoRechargeEnabled: boolean; autoRechargeThreshold: number; autoRechargeAmount: number;
}
interface DebitResult { previousBalance: number; debitedAmount: number; newBalance: number; sufficient: boolean; suspended: boolean; transactionRef: string; }

function WalletTab() {
  const [subId, setSubId] = useState("");
  const [amount, setAmount] = useState(50);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const getMut = useMutation({
    mutationFn: () => api<Wallet>(`/api/v1/billing/prepaid?subscriberId=${encodeURIComponent(subId)}`),
    onSuccess: setWallet,
    onError: (e: Error) => toast.error("Failed to load wallet", { description: e.message }),
  });
  const topupMut = useMutation({
    mutationFn: () => api<Wallet>("/api/v1/billing/prepaid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId: subId, action: "topup", amount, method: "cash" }) }),
    onSuccess: (d) => { setWallet(d); toast.success(`Wallet topped up ${amount}`); },
    onError: (e: Error) => toast.error("Top-up failed", { description: e.message }),
  });
  const debitMut = useMutation({
    mutationFn: () => api<DebitResult>("/api/v1/billing/prepaid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriberId: subId, action: "debit", amount, description: "Manual debit" }) }),
    onSuccess: (d) => {
      toast.success(d.suspended ? "Insufficient balance — subscriber auto-suspended" : `Debited ${d.debitedAmount}`, { description: `New balance: ${d.newBalance}` });
      getMut.mutate();
    },
    onError: (e: Error) => toast.error("Debit failed", { description: e.message }),
  });
  const bulkMut = useMutation({
    mutationFn: () => api<{ processed: number; debited: number; suspended: number }>("/api/v1/billing/prepaid", { method: "PUT" }),
    onSuccess: (d) => toast.success("Prepaid run complete", { description: `${d.debited} debited · ${d.suspended} suspended` }),
    onError: (e: Error) => toast.error("Bulk run failed", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Prepaid Wallet</CardTitle>
          <CardDescription>
            Subscribers on prepaid plans carry a wallet balance. Auto-recharge triggers below threshold; insufficient balance auto-suspends the subscriber.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid w-full gap-1.5"><Label>Subscriber ID</Label><Input value={subId} onChange={(e) => setSubId(e.target.value)} placeholder="cmo..." /></div>
            <div className="grid w-40 gap-1.5"><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <Button variant="outline" disabled={!subId || getMut.isPending} onClick={() => getMut.mutate()}>
              {getMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />} Load Wallet
            </Button>
          </div>
          {wallet && (
            <div className="rounded-lg border p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Balance" value={`${wallet.currency} ${wallet.balance.toFixed(2)}`} hintTone={wallet.balance > 0 ? "ok" : "warn"} />
              <Metric label="Customer" value={wallet.customerId} />
              <Metric label="Last Top-Up" value={wallet.lastTopUpAt ? new Date(wallet.lastTopUpAt).toLocaleString() : "Never"} />
              <Metric label="Auto-Recharge" value={wallet.autoRechargeEnabled ? `@ ${wallet.autoRechargeThreshold}` : "Off"} hintTone={wallet.autoRechargeEnabled ? "ok" : undefined} />
            </div>
          )}
          {wallet && (
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!subId || topupMut.isPending} onClick={() => topupMut.mutate()}>
                {topupMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />} Top-Up {amount}
              </Button>
              <Button variant="outline" disabled={!subId || debitMut.isPending} onClick={() => debitMut.mutate()}>
                {debitMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Debit {amount}
              </Button>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
            <div className="text-sm text-muted-foreground">Bulk prepaid deductions — debit all active prepaid subscribers for their plan fee.</div>
            <Button variant="secondary" size="sm" disabled={bulkMut.isPending} onClick={() => bulkMut.mutate()}>
              {bulkMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Run Bulk
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// Shared metric widget
// =====================================================================
function Metric({ label, value, hint, hintTone }: { label: string; value: string; hint?: string; hintTone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className={`mt-1 text-xs ${hintTone === "warn" ? "text-amber-600 dark:text-amber-400" : hintTone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// MAIN — tabbed control center
// =====================================================================
export function EnginesControlCenter() {
  return (
    <div className="min-h-screen p-4 pb-20 sm:p-6 lg:p-8">
      <PageHeader
        title="Business Logic Engines"
        description="Production-grade policy & billing engines — the decision brain of the platform."
      />
      <Tabs defaultValue="policy" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="policy" className="gap-1.5"><ShieldCheck className="h-4 w-4" /> Policy</TabsTrigger>
          <TabsTrigger value="fup" className="gap-1.5"><Gauge className="h-4 w-4" /> FUP</TabsTrigger>
          <TabsTrigger value="proration" className="gap-1.5"><CalendarRange className="h-4 w-4" /> Proration</TabsTrigger>
          <TabsTrigger value="dunning" className="gap-1.5"><RotateCcw className="h-4 w-4" /> Dunning</TabsTrigger>
          <TabsTrigger value="tax" className="gap-1.5"><Receipt className="h-4 w-4" /> Tax</TabsTrigger>
          <TabsTrigger value="aging" className="gap-1.5"><TrendingDown className="h-4 w-4" /> AR Aging</TabsTrigger>
          <TabsTrigger value="wallet" className="gap-1.5"><Wallet className="h-4 w-4" /> Prepaid</TabsTrigger>
        </TabsList>
        <TabsContent value="policy"><PolicyEngineTab /></TabsContent>
        <TabsContent value="fup"><FupTab /></TabsContent>
        <TabsContent value="proration"><ProrationTab /></TabsContent>
        <TabsContent value="dunning"><DunningTab /></TabsContent>
        <TabsContent value="tax"><TaxTab /></TabsContent>
        <TabsContent value="aging"><ArAgingTab /></TabsContent>
        <TabsContent value="wallet"><WalletTab /></TabsContent>
      </Tabs>
    </div>
  );
}
