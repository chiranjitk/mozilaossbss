// =====================================================================
// INCIDENTS CLIENT — list, create, acknowledge, resolve, close
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Plus, CheckCircle2, Clock, Eye, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface IncItem {
  id: string; incidentNo: string; title: string; description: string | null;
  severity: string; status: string; category: string; affectedAreas: string | null;
  reportedBy: string | null; assignee: { id: string; name: string } | null;
  startedAt: string; acknowledgedAt: string | null; resolvedAt: string | null; closedAt: string | null;
  resolution: string | null; rootCause: string | null; duration: number; createdAt: string;
}

async function fetchInc(params: { page: number; pageSize: number; search: string; status: string; severity: string }): Promise<{ data: IncItem[]; total: number }> {
  const url = new URL("/api/v1/incidents", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params.severity && params.severity !== "all") url.searchParams.set("severity", params.severity);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

const SEVERITY_COLORS: Record<string, string> = { minor: "bg-muted text-muted-foreground", major: "bg-warning/10 text-warning", critical: "bg-destructive/10 text-destructive", catastrophic: "bg-destructive/20 text-destructive" };
const CATEGORY_LABELS: Record<string, string> = { network: "Network", system: "System", security: "Security", power: "Power", other: "Other" };

const formatDuration = (seconds: number) => { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); if (h > 0) return `${h}h ${m}m`; return `${m}m`; };

export function IncidentsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<IncItem | null>(null);
  const [resolution, setResolution] = useState("");
  const [rootCause, setRootCause] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["incidents", { page, pageSize, search, statusFilter, severityFilter }],
    queryFn: () => fetchInc({ page, pageSize, search, status: statusFilter, severity: severityFilter }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: async (values: any) => { const res = await fetch("/api/v1/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message ?? "Failed"); } },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); queryClient.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Incident created"); setCreateOpen(false); },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/incidents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "acknowledged" }) }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); toast.success("Acknowledged"); },
    onError: () => toast.error("Failed"),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution, rootCause }: { id: string; resolution: string; rootCause: string }) => { const res = await fetch(`/api/v1/incidents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved", resolution, rootCause }) }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); toast.success("Resolved"); setResolveTarget(null); setResolution(""); setRootCause(""); },
    onError: () => toast.error("Failed"),
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => { const res = await fetch(`/api/v1/incidents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed" }) }); if (!res.ok) throw new Error("Failed"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); toast.success("Closed"); },
    onError: () => toast.error("Failed"),
  });

  const handleSearchChange = useCallback((v: string) => { setSearch(v); setPage(1); }, []);

  const columns = useMemo<ColumnDef<IncItem>[]>(() => [
    { id: "incNo", header: "Incident #", cell: ({ row }) => <code className="text-xs font-mono text-brand">{row.original.incidentNo}</code> },
    { id: "title", header: "Title", cell: ({ row }) => <div className="max-w-xs"><p className="text-sm font-medium truncate">{row.original.title}</p>{row.original.category && <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{CATEGORY_LABELS[row.original.category] ?? row.original.category}</span>}</div> },
    { id: "severity", header: "Severity", cell: ({ row }) => <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize", SEVERITY_COLORS[row.original.severity] ?? "bg-muted")}>{row.original.severity}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "duration", header: "Duration", cell: ({ row }) => <span className="text-xs tabular-nums">{formatDuration(row.original.duration)}</span> },
    { id: "started", header: "Started", cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(row.original.startedAt), { addSuffix: true })}</span> },
    { id: "assignee", header: "Assigned", cell: ({ row }) => row.original.assignee ? <span className="text-xs">{row.original.assignee.name}</span> : <span className="text-xs text-muted-foreground">Unassigned</span> },
    { id: "actions", header: "", cell: ({ row }) => (
      <div className="flex items-center gap-1 justify-end">
        {row.original.status === "open" && <Button variant="ghost" size="sm" className="h-8" onClick={() => acknowledgeMutation.mutate(row.original.id)}><Eye className="mr-1 h-3.5 w-3.5" /> Acknowledge</Button>}
        {["open", "acknowledged"].includes(row.original.status) && <Button variant="ghost" size="sm" className="h-8 text-success hover:text-success" onClick={() => setResolveTarget(row.original)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolve</Button>}
        {row.original.status === "resolved" && <Button variant="ghost" size="sm" className="h-8" onClick={() => closeMutation.mutate(row.original.id)}>Close</Button>}
      </div>
    ) },
  ], [acknowledgeMutation, closeMutation]);

  return (
    <>
      <PageHeader title="Incidents" description="Track outages, service disruptions, and security events. Manage severity, status, and resolution." actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" /> New Incident</Button>} />
      {data?.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand"><AlertTriangle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.total}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning"><Clock className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((i) => ["open", "acknowledged"].includes(i.status)).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive"><AlertTriangle className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((i) => ["critical", "catastrophic"].includes(i.severity)).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Critical</p></div></div></Card>
          <Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xl font-semibold tabular-nums">{data.data.filter((i) => ["resolved", "closed"].includes(i.status)).length}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resolved</p></div></div></Card>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="acknowledged">Acknowledged</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All severity</SelectItem><SelectItem value="minor">Minor</SelectItem><SelectItem value="major">Major</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="catastrophic">Catastrophic</SelectItem></SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} error={error?.message} onRetry={() => refetch()} pagination={{ page, pageSize, total: data?.total ?? 0 }} onPaginationChange={(p, ps) => { setPage(p); setPageSize(ps); }} search={search} onSearchChange={handleSearchChange} searchPlaceholder="Search by incident #, title, or description…" emptyMessage="No incidents" emptyDescription="Create an incident to track an outage or event." />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-brand" /> New Incident</DialogTitle><DialogDescription>Report an incident or outage.</DialogDescription></DialogHeader>
          <IncForm isSaving={createMutation.isPending} onSave={(values) => createMutation.mutate(values)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!resolveTarget} onOpenChange={(o) => { if (!o) { setResolveTarget(null); setResolution(""); setRootCause(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> Resolve Incident</DialogTitle><DialogDescription>Resolve {resolveTarget?.incidentNo}: {resolveTarget?.title}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label htmlFor="resolution">Resolution</Label><Textarea id="resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="How was the incident resolved?" rows={3} /></div>
            <div className="space-y-2"><Label htmlFor="rootCause">Root Cause</Label><Textarea id="rootCause" value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="What was the underlying cause?" rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setResolveTarget(null); setResolution(""); setRootCause(""); }}>Cancel</Button><Button disabled={resolveMutation.isPending || !resolution} onClick={() => resolveTarget && resolveMutation.mutate({ id: resolveTarget.id, resolution, rootCause })}>{resolveMutation.isPending ? "Resolving…" : "Resolve"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IncForm({ isSaving, onSave }: { isSaving: boolean; onSave: (values: any) => void }) {
  const [form, setForm] = useState({ title: "", description: "", severity: "minor", category: "network", affectedAreas: "" });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, affectedAreas: form.affectedAreas || undefined }); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="i-title">Title *</Label><Input id="i-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required placeholder="e.g. Building A network outage" /></div>
      <div className="space-y-2"><Label htmlFor="i-desc">Description</Label><Textarea id="i-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} placeholder="What happened?" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Severity</Label><Select value={form.severity} onValueChange={(v) => setForm((p) => ({ ...p, severity: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="minor">Minor</SelectItem><SelectItem value="major">Major</SelectItem><SelectItem value="critical">Critical</SelectItem><SelectItem value="catastrophic">Catastrophic</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="space-y-2"><Label htmlFor="i-areas">Affected Areas</Label><Input id="i-areas" value={form.affectedAreas} onChange={(e) => setForm((p) => ({ ...p, affectedAreas: e.target.value }))} placeholder="e.g. Building A, Subnet 192.168.1.0/24" /></div>
      <DialogFooter><Button type="submit" disabled={isSaving || !form.title}>{isSaving ? "Creating…" : "Create Incident"}</Button></DialogFooter>
    </form>
  );
}
