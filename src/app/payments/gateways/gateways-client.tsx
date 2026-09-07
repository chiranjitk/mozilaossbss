// =====================================================================
// PAYMENT GATEWAYS CLIENT — list, configure, enable/disable adapters
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plug, Plus, CreditCard, CheckCircle2, XCircle, Loader2, KeyRound, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface Gateway {
  id: string; name: string; displayName: string | null; adapter: string;
  enabled: boolean; isDefault: boolean; testMode: boolean; hasConfig: boolean;
  lastUsedAt: string | null; supportedMethods: string[];
  createdAt: string; updatedAt: string;
}

const ADAPTER_INFO: Record<string, { displayName: string; methods: string[]; configFields: string[] }> = {
  manual: { displayName: "Manual / Cash", methods: ["cash", "bank", "cheque"], configFields: [] },
  stripe: { displayName: "Stripe", methods: ["card", "apple_pay", "google_pay"], configFields: ["apiKey", "webhookSecret"] },
  razorpay: { displayName: "Razorpay", methods: ["card", "upi", "netbanking", "wallet", "emi"], configFields: ["keyId", "keySecret", "webhookSecret"] },
  paypal: { displayName: "PayPal", methods: ["paypal", "card"], configFields: ["clientId", "clientSecret", "webhookId"] },
};

const ADAPTER_COLORS: Record<string, string> = {
  manual: "bg-muted text-muted-foreground", stripe: "bg-brand/10 text-brand",
  razorpay: "bg-info/10 text-info", paypal: "bg-warning/10 text-warning",
};

async function fetchGateways(): Promise<Gateway[]> {
  const res = await fetch("/api/v1/payment-gateways?pageSize=50", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return json.data;
}

export function GatewaysClient() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: gateways, isLoading, isError, refetch } = useQuery<Gateway[]>({ queryKey: ["gateways"], queryFn: fetchGateways });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/v1/payment-gateways/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gateways"] }); toast.success("Gateway updated"); },
    onError: () => toast.error("Failed to update"),
  });

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await fetch("/api/v1/payment-gateways", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gateways"] }); toast.success("Gateway created"); setCreateOpen(false); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  if (isLoading) return (<><PageHeader title="Payment Gateways" /><LoadingState /></>);
  if (isError || !gateways) return (<><PageHeader title="Payment Gateways" /><ErrorState onRetry={() => refetch()} /></>);

  return (
    <>
      <PageHeader title="Payment Gateways" description="Configure payment gateway adapters. Each adapter is an independent module — disabled gateways consume zero resources." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> Add Gateway</Button>} />

      {/* Adapter catalog */}
      <Card className="mb-5 bg-muted/20 border-dashed">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Zap className="h-4 w-4 text-brand" /> Available Adapters</CardTitle><CardDescription>Adapters implement the PaymentGatewayInterface. New adapters can be added without changing the payment service.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(ADAPTER_INFO).map(([name, info]) => {
              const configured = gateways.some((g) => g.adapter === name);
              return (
                <div key={name} className={cn("rounded-md border p-3", configured ? "border-success/30 bg-success/5" : "border-border")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", ADAPTER_COLORS[name])}>{info.displayName}</span>
                    {configured ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{info.methods.join(", ")}</p>
                  {info.configFields.length > 0 && <p className="text-[10px] text-muted-foreground mt-1">Requires: {info.configFields.join(", ")}</p>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Configured gateways */}
      {gateways.length === 0 ? (
        <EmptyState title="No gateways configured" description="Add a payment gateway to start accepting online payments." icon={Plug} action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> Add Gateway</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {gateways.map((gw) => {
            const info = ADAPTER_INFO[gw.adapter] ?? { displayName: gw.adapter, methods: [], configFields: [] };
            return (
              <Card key={gw.id} className={cn(gw.enabled && "ring-1 ring-brand/20")}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", gw.enabled ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground")}><CreditCard className="h-4.5 w-4.5" /></div>
                      <div>
                        <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{gw.displayName ?? gw.name}</h3>{gw.isDefault && <Badge variant="outline" className="text-[10px] text-brand border-brand/30">DEFAULT</Badge>}{gw.testMode && <Badge variant="outline" className="text-[10px] text-warning border-warning/30">TEST</Badge>}</div>
                        <code className="text-xs text-muted-foreground font-mono">{gw.name}</code>
                      </div>
                    </div>
                    <Switch checked={gw.enabled} onCheckedChange={(checked) => toggleMutation.mutate({ id: gw.id, enabled: checked })} />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {info.methods.map((m) => <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>)}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1"><KeyRound className="h-3 w-3 text-muted-foreground" /> {gw.hasConfig ? "Configured" : "Not configured"}</span>
                    {gw.lastUsedAt && <span className="text-muted-foreground">Used {formatDistanceToNow(new Date(gw.lastUsedAt), { addSuffix: true })}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plug className="h-5 w-5 text-brand" /> Add Payment Gateway</DialogTitle><DialogDescription>Configure a new payment gateway adapter.</DialogDescription></DialogHeader>
          <GatewayForm isSaving={createMutation.isPending} onSave={(values) => createMutation.mutate(values)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function GatewayForm({ isSaving, onSave }: { isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({ name: "", displayName: "", adapter: "manual", testMode: true, enabled: false, isDefault: false, config: {} as Record<string, string> });
  const info = ADAPTER_INFO[form.adapter] ?? { configFields: [] };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, config: form.config }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="g-name">Name *</Label><Input id="g-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. stripe-main" required className="font-mono" /></div>
        <div className="space-y-2"><Label htmlFor="g-display">Display Name</Label><Input id="g-display" value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} placeholder="e.g. Stripe (Main)" /></div>
      </div>
      <div className="space-y-2"><Label>Adapter</Label><Select value={form.adapter} onValueChange={(v) => setForm((p) => ({ ...p, adapter: v, config: {} }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ADAPTER_INFO).map(([val, info]) => <SelectItem key={val} value={val}>{info.displayName}</SelectItem>)}</SelectContent></Select></div>
      {info.configFields.length > 0 && (
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configuration</p>
          {info.configFields.map((field) => (
            <div key={field} className="space-y-1"><Label htmlFor={`cfg-${field}`} className="text-xs">{field}</Label><Input id={`cfg-${field}`} type="password" value={form.config[field] ?? ""} onChange={(e) => setForm((p) => ({ ...p, config: { ...p.config, [field]: e.target.value } }))} placeholder={`Enter ${field}`} className="h-8 text-xs font-mono" /></div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.testMode} onCheckedChange={(v) => setForm((p) => ({ ...p, testMode: v }))} /><span className="text-sm">Test Mode</span></label>
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} /><span className="text-sm">Enabled</span></label>
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.isDefault} onCheckedChange={(v) => setForm((p) => ({ ...p, isDefault: v }))} /><span className="text-sm">Default</span></label>
      </div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name}>{isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Add Gateway</Button></DialogFooter>
    </form>
  );
}
