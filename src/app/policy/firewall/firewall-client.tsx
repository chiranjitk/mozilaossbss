// =====================================================================
// FIREWALL RULES CLIENT — list, create, edit, delete, enable/disable
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
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Flame, Plus, Edit, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Rule {
  id: string; name: string; description: string | null; action: string; chain: string;
  protocol: string | null; srcAddress: string | null; dstAddress: string | null;
  srcPort: string | null; dstPort: string | null; interface: string | null;
  direction: string | null; priority: number; enabled: boolean; log: boolean; createdAt: string;
}

const ACTION_COLORS: Record<string, string> = { accept: "bg-success/10 text-success", drop: "bg-destructive/10 text-destructive", reject: "bg-destructive/10 text-destructive", masquerade: "bg-warning/10 text-warning" };

export function FirewallClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [chainFilter, setChainFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Rule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["firewall-rules", { page, pageSize, search, actionFilter, chainFilter }],
    queryFn: async () => {
      const url = new URL("/api/v1/firewall-rules", window.location.origin);
      url.searchParams.set("page", String(page)); url.searchParams.set("pageSize", String(pageSize));
      if (search) url.searchParams.set("search", search);
      if (actionFilter !== "all") url.searchParams.set("action", actionFilter);
      if (chainFilter !== "all") url.searchParams.set("chain", chainFilter);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const json = await res.json(); return { data: json.data, total: json.meta.total };
    },
    placeholderData: (prev) => prev,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/v1/firewall-rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["firewall-rules"] }); toast.success("Rule updated"); },
    onError: () => toast.error("Failed"),
  });

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      const isEdit = !!values.id;
      const res = await fetch(isEdit ? `/api/v1/firewall-rules/${values.id}` : "/api/v1/firewall-rules", { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["firewall-rules"] }); toast.success("Saved"); setCreateOpen(false); setEditTarget(null); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/firewall-rules/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["firewall-rules"] }); toast.success("Deleted"); setDeleteTarget(null); },
    onError: () => toast.error("Delete failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<Rule>[]>(() => [
    { id: "priority", header: "#", cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{row.original.priority}</span> },
    { id: "name", header: "Rule", cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.name}</p>{row.original.description && <p className="text-xs text-muted-foreground line-clamp-1">{row.original.description}</p>}</div> },
    { id: "action", header: "Action", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize", ACTION_COLORS[row.original.action] ?? "bg-muted")}>{row.original.action}</span> },
    { id: "chain", header: "Chain", cell: ({ row }) => <Badge variant="outline" className="text-[10px] uppercase">{row.original.chain}</Badge> },
    { id: "match", header: "Match", cell: ({ row }) => <div className="text-xs"><p>{row.original.protocol ?? "any"} {row.original.srcAddress ?? "*"}:{row.original.srcPort ?? "*"} → {row.original.dstAddress ?? "*"}:{row.original.dstPort ?? "*"}</p>{row.original.interface && <p className="text-muted-foreground">iface: {row.original.interface}</p>}</div> },
    { id: "log", header: "Log", cell: ({ row }) => row.original.log ? <Badge variant="outline" className="text-[10px] text-warning border-warning/30">LOG</Badge> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "enabled", header: "Enabled", cell: ({ row }) => <Switch checked={row.original.enabled} onCheckedChange={(checked) => toggleMutation.mutate({ id: row.original.id, enabled: checked })} /> },
    { id: "actions", header: "", cell: ({ row }) => <div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditTarget(row.original)}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button></div> },
  ], [toggleMutation]);

  return (
    <>
      <PageHeader title="Firewall Rules" description="Manage packet filtering rules. Rules are ordered by priority and applied on NAS devices." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Rule</Button>} />
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><Flame className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Rules</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((r) => r.enabled).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Enabled</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground"><XCircle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((r) => !r.enabled).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Disabled</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive"><Flame className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((r) => r.action === "drop" || r.action === "reject").length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Blocking</p></div></div></Card>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All actions</SelectItem><SelectItem value="accept">Accept</SelectItem><SelectItem value="drop">Drop</SelectItem><SelectItem value="reject">Reject</SelectItem><SelectItem value="masquerade">Masquerade</SelectItem></SelectContent>
        </Select>
        <Select value={chainFilter} onValueChange={(v) => { setChainFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Chain" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All chains</SelectItem><SelectItem value="input">Input</SelectItem><SelectItem value="output">Output</SelectItem><SelectItem value="forward">Forward</SelectItem></SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search rules…" emptyMessage="No firewall rules" emptyDescription="Create a rule to control network traffic." />
      <Dialog open={createOpen || !!editTarget} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader><DialogTitle>{editTarget ? `Edit: ${editTarget.name}` : "New Firewall Rule"}</DialogTitle><DialogDescription>Define packet matching criteria and action.</DialogDescription></DialogHeader>
          <FirewallForm rule={editTarget} isSaving={saveMutation.isPending} onSave={(values) => saveMutation.mutate({ ...values, id: editTarget?.id })} />
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete rule?</AlertDialogTitle><AlertDialogDescription>Delete {deleteTarget?.name}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FirewallForm({ rule, isSaving, onSave }: { rule: Rule | null; isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({
    name: rule?.name ?? "", description: rule?.description ?? "", action: rule?.action ?? "accept",
    chain: rule?.chain ?? "forward", protocol: rule?.protocol ?? "", srcAddress: rule?.srcAddress ?? "",
    dstAddress: rule?.dstAddress ?? "", srcPort: rule?.srcPort ?? "", dstPort: rule?.dstPort ?? "",
    interface: rule?.interface ?? "", direction: rule?.direction ?? "", priority: String(rule?.priority ?? 100),
    enabled: rule?.enabled ?? true, log: rule?.log ?? false,
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({
      name: form.name, description: form.description || undefined, action: form.action, chain: form.chain,
      protocol: form.protocol || undefined, srcAddress: form.srcAddress || undefined, dstAddress: form.dstAddress || undefined,
      srcPort: form.srcPort || undefined, dstPort: form.dstPort || undefined, interface: form.interface || undefined,
      direction: form.direction || undefined, priority: Number(form.priority), enabled: form.enabled, log: form.log,
    }); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="f-name">Name *</Label><Input id="f-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
      <div className="space-y-2"><Label htmlFor="f-desc">Description</Label><Textarea id="f-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2"><Label>Action</Label><Select value={form.action} onValueChange={(v) => setForm((p) => ({ ...p, action: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accept">Accept</SelectItem><SelectItem value="drop">Drop</SelectItem><SelectItem value="reject">Reject</SelectItem><SelectItem value="masquerade">Masquerade</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Chain</Label><Select value={form.chain} onValueChange={(v) => setForm((p) => ({ ...p, chain: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="input">Input</SelectItem><SelectItem value="output">Output</SelectItem><SelectItem value="forward">Forward</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Protocol</Label><Select value={form.protocol || "any"} onValueChange={(v) => setForm((p) => ({ ...p, protocol: v === "any" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="tcp">TCP</SelectItem><SelectItem value="udp">UDP</SelectItem><SelectItem value="icmp">ICMP</SelectItem></SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="f-src">Source Address</Label><Input id="f-src" value={form.srcAddress} onChange={(e) => setForm((p) => ({ ...p, srcAddress: e.target.value }))} placeholder="192.168.1.0/24" className="font-mono" /></div>
        <div className="space-y-2"><Label htmlFor="f-dst">Dest Address</Label><Input id="f-dst" value={form.dstAddress} onChange={(e) => setForm((p) => ({ ...p, dstAddress: e.target.value }))} placeholder="0.0.0.0/0" className="font-mono" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="f-sport">Source Port</Label><Input id="f-sport" value={form.srcPort} onChange={(e) => setForm((p) => ({ ...p, srcPort: e.target.value }))} placeholder="any" className="font-mono" /></div>
        <div className="space-y-2"><Label htmlFor="f-dport">Dest Port</Label><Input id="f-dport" value={form.dstPort} onChange={(e) => setForm((p) => ({ ...p, dstPort: e.target.value }))} placeholder="80, 443" className="font-mono" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="f-iface">Interface</Label><Input id="f-iface" value={form.interface} onChange={(e) => setForm((p) => ({ ...p, interface: e.target.value }))} placeholder="ether1" /></div>
        <div className="space-y-2"><Label htmlFor="f-prio">Priority</Label><Input id="f-prio" type="number" min="1" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} /></div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} /><span className="text-sm">Enabled</span></label>
        <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.log} onCheckedChange={(v) => setForm((p) => ({ ...p, log: v }))} /><span className="text-sm">Log matches</span></label>
      </div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.name}>{isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{rule ? "Save Changes" : "Create Rule"}</Button></DialogFooter>
    </form>
  );
}
