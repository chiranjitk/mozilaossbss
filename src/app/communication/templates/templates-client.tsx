// =====================================================================
// TEMPLATES CLIENT — list, create, edit, delete, send test
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { FileText, Plus, Edit, Trash2, Send, Loader2, Mail, MessageSquare, Smartphone, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string; name: string; channel: string; subject: string | null;
  body: string; variables: string[]; language: string; status: string; createdAt: string;
}

const CHANNEL_ICONS: Record<string, typeof Mail> = { email: Mail, sms: Smartphone, whatsapp: MessageSquare, push: Bell };
const CHANNEL_COLORS: Record<string, string> = { email: "bg-brand/10 text-brand", sms: "bg-success/10 text-success", whatsapp: "bg-info/10 text-info", push: "bg-warning/10 text-warning" };

async function fetchTemplates(params: { page: number; pageSize: number; search: string; channel: string }): Promise<{ data: Template[]; total: number }> {
  const url = new URL("/api/v1/templates", window.location.origin);
  url.searchParams.set("page", String(params.page)); url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.channel && params.channel !== "all") url.searchParams.set("channel", params.channel);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json(); return { data: json.data, total: json.meta.total };
}

export function TemplatesClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [testTarget, setTestTarget] = useState<Template | null>(null);
  const [testRecipient, setTestRecipient] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["templates", { page, pageSize, search, channelFilter }],
    queryFn: () => fetchTemplates({ page, pageSize, search, channel: channelFilter }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const isEdit = !!values.id;
      const res = await fetch(isEdit ? `/api/v1/templates/${values.id}` : "/api/v1/templates", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); toast.success("Saved"); setCreateOpen(false); setEditTarget(null); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/templates/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); toast.success("Deleted"); setDeleteTarget(null); },
    onError: () => toast.error("Delete failed"),
  });

  const testMutation = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: string }) => {
      const res = await fetch(`/api/v1/templates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_test", to }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
      return res.json();
    },
    onSuccess: (json) => { toast.success(json.data.sent ? "Test sent" : "Test failed", { description: json.data.error }); setTestTarget(null); setTestRecipient(""); },
    onError: (e: Error) => toast.error("Test failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<Template>[]>(() => [
    { id: "name", header: "Template", cell: ({ row }) => {
      const Icon = CHANNEL_ICONS[row.original.channel] ?? FileText;
      return <div className="flex items-center gap-3"><div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", CHANNEL_COLORS[row.original.channel] ?? "bg-muted")}><Icon className="h-4 w-4" /></div><div><p className="text-sm font-medium">{row.original.name}</p>{row.original.subject && <p className="text-xs text-muted-foreground truncate">{row.original.subject}</p>}</div></div>;
    }},
    { accessorKey: "channel", header: "Channel", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize", CHANNEL_COLORS[row.original.channel] ?? "bg-muted")}>{row.original.channel}</span> },
    { id: "variables", header: "Variables", cell: ({ row }) => row.original.variables.length > 0 ? <div className="flex flex-wrap gap-1 max-w-xs">{row.original.variables.slice(0, 5).map((v) => <Badge key={v} variant="outline" className="text-[10px] font-mono py-0">{`{{${v}}}`}</Badge>)}{row.original.variables.length > 5 && <Badge variant="outline" className="text-[10px] py-0">+{row.original.variables.length - 5}</Badge>}</div> : <span className="text-xs text-muted-foreground">—</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "created", header: "Created", cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}</span> },
    { id: "actions", header: "", cell: ({ row }) => (
      <div className="flex items-center gap-1 justify-end">
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Send test" onClick={() => { setTestTarget(row.original); setTestRecipient("test@example.com"); }}><Send className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}><Edit className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ], []);

  return (
    <>
      <PageHeader title="Notification Templates" description="Manage message templates with {{variable}} placeholders. Each channel (email, SMS, WhatsApp, push) has its own templates." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Template</Button>} />

      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><FileText className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Mail className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((t) => t.channel === "email").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><Smartphone className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((t) => t.channel === "sms").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">SMS</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info"><MessageSquare className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((t) => t.channel === "whatsapp").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">WhatsApp</p></div></div></Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All channels</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="push">Push</SelectItem></SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search templates…" emptyMessage="No templates" emptyDescription="Create a template to start sending notifications." />

      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader><DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "New Template"}</DialogTitle><DialogDescription>Use {"{{variables}}"} for dynamic content.</DialogDescription></DialogHeader>
          <TemplateForm template={editTarget} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete template?</AlertDialogTitle><AlertDialogDescription>Delete {deleteTarget?.name}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!testTarget} onOpenChange={(o) => { if (!o) { setTestTarget(null); setTestRecipient(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-brand" /> Send Test</DialogTitle><DialogDescription>Send a test message using template: {testTarget?.name}</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="test-to">Recipient ({testTarget?.channel})</Label><Input id="test-to" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder={testTarget?.channel === "email" ? "email@example.com" : "+91 98765 43210"} /></div>
          <DialogFooter><Button variant="outline" onClick={() => { setTestTarget(null); setTestRecipient(""); }}>Cancel</Button><Button disabled={testMutation.isPending} onClick={() => testTarget && testMutation.mutate({ id: testTarget.id, to: testRecipient })}>{testMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Send Test</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateForm({ template, isSaving, onSave }: { template: Template | null; isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    name: template?.name ?? "", channel: template?.channel ?? "email",
    subject: template?.subject ?? "", body: template?.body ?? "", language: template?.language ?? "en", status: template?.status ?? "active",
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ name: form.name, channel: form.channel, subject: form.subject || undefined, body: form.body, language: form.language, status: form.status }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="t-name">Name *</Label><Input id="t-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required placeholder="Welcome Email" /></div>
        <div className="space-y-2"><Label>Channel</Label><Select value={form.channel} onValueChange={(v) => setForm((p) => ({ ...p, channel: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="push">Push</SelectItem></SelectContent></Select></div>
      </div>
      {form.channel === "email" && <div className="space-y-2"><Label htmlFor="t-subject">Subject</Label><Input id="t-subject" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} placeholder="Welcome to Cryptsk!" /></div>}
      <div className="space-y-2"><Label htmlFor="t-body">Body *</Label><Textarea id="t-body" value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} rows={6} required placeholder="Hello {firstName}, your account is active. Plan: {planName}" /></div>
      <p className="text-xs text-muted-foreground">Variables are auto-extracted from double-brace patterns in the body.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Language</Label><Select value={form.language} onValueChange={(v) => setForm((p) => ({ ...p, language: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="hi">Hindi</SelectItem><SelectItem value="bn">Bengali</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select></div>
      </div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name || !form.body}>{isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{template ? "Save Changes" : "Create Template"}</Button></DialogFooter>
    </form>
  );
}
