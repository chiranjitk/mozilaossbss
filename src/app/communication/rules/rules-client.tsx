// =====================================================================
// NOTIFICATION RULES CLIENT — event → template mapping
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Bell, Plus, Edit, Trash2, Clock, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Rule {
  id: string; name: string; event: string; templateId: string;
  template: { name: string; channel: string } | null;
  channel: string; recipient: string; customRecipient: string | null;
  enabled: boolean; delayMinutes: number; createdAt: string;
}

const CHANNEL_COLORS: Record<string, string> = { email: "bg-brand/10 text-brand", sms: "bg-success/10 text-success", whatsapp: "bg-info/10 text-info", push: "bg-warning/10 text-warning" };

const EVENTS = [
  "subscriber.created", "subscriber.suspended", "subscriber.reactivated", "subscriber.terminated",
  "invoice.created", "invoice.paid", "invoice.overdue",
  "payment.received", "payment.failed",
  "session.started", "session.stopped",
  "complaint.created", "complaint.resolved",
  "nas.online", "nas.offline", "alert.triggered",
];

async function fetchRules(params: { page: number; pageSize: number; search: string; enabled: string }): Promise<{ data: Rule[]; total: number }> {
  const url = new URL("/api/v1/notification-rules", window.location.origin);
  url.searchParams.set("page", String(params.page)); url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.enabled && params.enabled !== "all") url.searchParams.set("enabled", params.enabled);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json(); return { data: json.data, total: json.meta.total };
}

async function fetchTemplates(): Promise<Array<{ id: string; name: string; channel: string }>> {
  const res = await fetch("/api/v1/templates?pageSize=100", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data.map((t: any) => ({ id: t.id, name: t.name, channel: t.channel }));
}

export function RulesClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [enabledFilter, setEnabledFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Rule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["rules", { page, pageSize, search, enabledFilter }],
    queryFn: () => fetchRules({ page, pageSize, search, enabled: enabledFilter }),
    placeholderData: (prev) => prev,
  });
  const { data: templates } = useQuery({ queryKey: ["templates-options"], queryFn: fetchTemplates });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/v1/notification-rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("Rule updated"); },
    onError: () => toast.error("Failed"),
  });

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const isEdit = !!values.id;
      const res = await fetch(isEdit ? `/api/v1/notification-rules/${values.id}` : "/api/v1/notification-rules", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("Saved"); setCreateOpen(false); setEditTarget(null); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/notification-rules/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("Deleted"); setDeleteTarget(null); },
    onError: () => toast.error("Delete failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<Rule>[]>(() => [
    { id: "name", header: "Rule", cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.recipient === "subscriber" ? "To subscriber" : row.original.recipient === "admin" ? "To admin" : `To: ${row.original.customRecipient ?? "custom"}`}</p></div> },
    { id: "event", header: "Event", cell: ({ row }) => <code className="text-xs font-mono text-brand">{row.original.event}</code> },
    { id: "mapping", header: "Template", cell: ({ row }) => <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{row.original.event.split(".").pop()}</span><ArrowRight className="h-3 w-3 text-muted-foreground" /><span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", CHANNEL_COLORS[row.original.channel] ?? "bg-muted")}>{row.original.template?.name ?? "—"}</span></div> },
    { id: "channel", header: "Channel", cell: ({ row }) => <Badge variant="outline" className="text-[10px] capitalize">{row.original.channel}</Badge> },
    { id: "delay", header: "Delay", cell: ({ row }) => row.original.delayMinutes > 0 ? <span className="flex items-center gap-1 text-xs"><Clock className="h-3 w-3 text-muted-foreground" />{row.original.delayMinutes}m</span> : <span className="text-xs text-muted-foreground">Immediate</span> },
    { id: "enabled", header: "Enabled", cell: ({ row }) => <Switch checked={row.original.enabled} onCheckedChange={(checked) => toggleMutation.mutate({ id: row.original.id, enabled: checked })} /> },
    { id: "created", header: "Created", cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}</span> },
    { id: "actions", header: "", cell: ({ row }) => <div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button></div> },
  ], [toggleMutation]);

  return (
    <>
      <PageHeader title="Notification Rules" description="Map platform events to notification templates. When an event fires, the matching template is sent via the configured channel." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Rule</Button>} />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Bell className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Rules</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><Bell className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((r) => r.enabled).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground"><Bell className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{new Set(data.data.map((r) => r.event)).size}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unique Events</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={enabledFilter} onValueChange={(v) => { setEnabledFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All rules</SelectItem><SelectItem value="true">Enabled</SelectItem><SelectItem value="false">Disabled</SelectItem></SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search rules or events…" emptyMessage="No notification rules" emptyDescription="Create a rule to send notifications on platform events." />

      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "New Notification Rule"}</DialogTitle><DialogDescription>When an event fires, send a template via a channel.</DialogDescription></DialogHeader>
          <RuleForm rule={editTarget} templates={templates ?? []} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete rule?</AlertDialogTitle><AlertDialogDescription>Delete {deleteTarget?.name}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RuleForm({ rule, templates, isSaving, onSave }: { rule: Rule | null; templates: Array<{ id: string; name: string; channel: string }>; isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    name: rule?.name ?? "", event: rule?.event ?? "subscriber.created",
    templateId: rule?.templateId ?? "", channel: rule?.channel ?? "email",
    recipient: rule?.recipient ?? "subscriber", customRecipient: rule?.customRecipient ?? "",
    enabled: rule?.enabled ?? true, delayMinutes: String(rule?.delayMinutes ?? 0),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({
      name: form.name, event: form.event, templateId: form.templateId, channel: form.channel,
      recipient: form.recipient, customRecipient: form.customRecipient || undefined,
      enabled: form.enabled, delayMinutes: Number(form.delayMinutes),
    }); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="r-name">Name *</Label><Input id="r-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required placeholder="Welcome on signup" /></div>
      <div className="space-y-2"><Label>Event (Trigger)</Label><Select value={form.event} onValueChange={(v) => setForm((p) => ({ ...p, event: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-60">{EVENTS.map((e) => <SelectItem key={e} value={e}><code className="font-mono text-xs">{e}</code></SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Template</Label><Select value={form.templateId} onValueChange={(v) => { const t = templates.find((t) => t.id === v); setForm((p) => ({ ...p, templateId: v, channel: t?.channel ?? p.channel })); }}><SelectTrigger><SelectValue placeholder="Select template…" /></SelectTrigger><SelectContent className="max-h-60">{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} <Badge variant="outline" className="ml-2 text-[10px]">{t.channel}</Badge></SelectItem>)}</SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Channel</Label><Select value={form.channel} onValueChange={(v) => setForm((p) => ({ ...p, channel: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="push">Push</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Recipient</Label><Select value={form.recipient} onValueChange={(v) => setForm((p) => ({ ...p, recipient: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="subscriber">Subscriber</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>
      </div>
      {form.recipient === "custom" && <div className="space-y-2"><Label htmlFor="r-custom">Custom Recipient</Label><Input id="r-custom" value={form.customRecipient} onChange={(e) => setForm((p) => ({ ...p, customRecipient: e.target.value }))} placeholder="email or phone" /></div>}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="r-delay">Delay (minutes)</Label><Input id="r-delay" type="number" min="0" value={form.delayMinutes} onChange={(e) => setForm((p) => ({ ...p, delayMinutes: e.target.value }))} /></div>
        <div className="space-y-2 flex items-end"><label className="flex items-center gap-2 cursor-pointer pb-2"><Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} /><span className="text-sm">Enabled</span></label></div>
      </div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name || !form.templateId}>{isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{rule ? "Save Changes" : "Create Rule"}</Button></DialogFooter>
    </form>
  );
}
