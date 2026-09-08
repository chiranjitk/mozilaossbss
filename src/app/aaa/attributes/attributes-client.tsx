// =====================================================================
// RADIUS ATTRIBUTES CLIENT — catalog of standard/vendor attributes
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  ListTree,
  Plus,
  Edit,
  Trash2,
  Hash,
  Type,
  Globe,
  Binary,
  Building2,
} from "lucide-react";

interface AttrItem {
  id: string;
  name: string;
  type: string;
  vendor: string | null;
  attrType: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

const ATTR_TYPES: Record<string, { label: string; icon: typeof Type }> = {
  string: { label: "String", icon: Type },
  integer: { label: "Integer", icon: Hash },
  ipaddr: { label: "IP Address", icon: Globe },
  octets: { label: "Octets", icon: Binary },
};

const ATTR_USAGE: Record<string, string> = {
  check: "Check",
  reply: "Reply",
  both: "Check + Reply",
};

async function fetchAttrs(params: {
  page: number;
  pageSize: number;
  search: string;
  type: string;
  vendor: string;
  attrType: string;
}): Promise<{ data: AttrItem[]; total: number }> {
  const url = new URL("/api/v1/radius-attributes", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.type && params.type !== "all") url.searchParams.set("type", params.type);
  if (params.vendor && params.vendor !== "all") url.searchParams.set("vendor", params.vendor);
  if (params.attrType && params.attrType !== "all")
    url.searchParams.set("attrType", params.attrType);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch RADIUS attributes");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveAttr(values: any): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/radius-attributes/${values.id}` : "/api/v1/radius-attributes",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save attribute");
  }
}

async function deleteAttr(id: string): Promise<void> {
  const res = await fetch(`/api/v1/radius-attributes/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete attribute");
  }
}

export function AttributesClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [attrTypeFilter, setAttrTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AttrItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttrItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "radius-attributes",
      { page, pageSize, search, typeFilter, attrTypeFilter },
    ],
    queryFn: () =>
      fetchAttrs({
        page,
        pageSize,
        search,
        type: typeFilter,
        vendor: "all",
        attrType: attrTypeFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: any) => saveAttr(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radius-attributes"] });
      toast.success("Attribute saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttr(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["radius-attributes"] });
      toast.success("Attribute deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<AttrItem>[]>(
    () => [
      {
        id: "name",
        header: "Attribute",
        cell: ({ row }) => (
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <ListTree className="h-3.5 w-3.5 text-brand shrink-0" />
              <code className="text-xs font-mono font-medium truncate">
                {row.original.name}
              </code>
            </div>
            {row.original.description && (
              <p className="text-xs text-muted-foreground truncate pl-5">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "vendor",
        header: "Vendor",
        cell: ({ row }) =>
          row.original.vendor ? (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Building2 className="h-3 w-3" />
              {row.original.vendor}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Standard</span>
          ),
      },
      {
        accessorKey: "type",
        header: "Data Type",
        cell: ({ row }) => {
          const meta = ATTR_TYPES[row.original.type];
          const Icon = meta?.icon ?? Type;
          return (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Icon className="h-3 w-3" />
              {meta?.label ?? row.original.type}
            </Badge>
          );
        },
      },
      {
        accessorKey: "attrType",
        header: "Usage",
        cell: ({ row }) => (
          <span className="text-xs">
            {ATTR_USAGE[row.original.attrType] ?? row.original.attrType}
          </span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.updatedAt), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditTarget(row.original)}
              aria-label="Edit attribute"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete attribute"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const attrs = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const vendorCount = new Set(attrs.map((a) => a.vendor).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        title="RADIUS Attributes"
        description="Catalog of standard and vendor-specific RADIUS attributes available for authorization policies."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Attribute
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <ListTree className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total Attributes
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-info/10 text-info">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{vendorCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Vendors
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <Type className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {attrs.filter((a) => a.type === "string").length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                String Type
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <Hash className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {attrs.filter((a) => a.type === "integer").length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Integer Type
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Data type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="string">String</SelectItem>
            <SelectItem value="integer">Integer</SelectItem>
            <SelectItem value="ipaddr">IP Address</SelectItem>
            <SelectItem value="octets">Octets</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={attrTypeFilter}
          onValueChange={(v) => {
            setAttrTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Usage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All usages</SelectItem>
            <SelectItem value="check">Check</SelectItem>
            <SelectItem value="reply">Reply</SelectItem>
            <SelectItem value="both">Check + Reply</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={attrs}
        isLoading={isLoading}
        isError={isError}
        error={error?.message}
        onRetry={() => refetch()}
        pagination={{ page, pageSize, total: data?.total ?? 0 }}
        onPaginationChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by name, vendor, or description…"
        emptyMessage="No RADIUS attributes"
        emptyDescription="Define attributes to use them in authorization policies."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTree className="h-5 w-5 text-brand" /> New RADIUS Attribute
            </DialogTitle>
            <DialogDescription>
              Define a standard or vendor-specific RADIUS attribute.
            </DialogDescription>
          </DialogHeader>
          <AttrForm isSaving={saveMutation.isPending} onSave={(v) => saveMutation.mutate(v)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-brand" /> Edit RADIUS Attribute
            </DialogTitle>
            <DialogDescription>
              Update <code className="font-mono">{editTarget?.name}</code>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <AttrForm
              key={editTarget.id}
              initial={editTarget}
              isSaving={saveMutation.isPending}
              onSave={(v) => saveMutation.mutate({ ...v, id: editTarget.id })}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete RADIUS attribute?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <code className="font-mono">{deleteTarget?.name}</code>. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------
// FORM — used for both create and edit
// ---------------------------------------------------------------------

function AttrForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: AttrItem;
  isSaving: boolean;
  onSave: (values: any) => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    type: initial?.type ?? "string",
    vendor: initial?.vendor ?? "",
    attrType: initial?.attrType ?? "both",
    description: initial?.description ?? "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name,
          type: form.type,
          vendor: form.vendor || null,
          attrType: form.attrType,
          description: form.description || undefined,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="at-name">Attribute Name *</Label>
        <Input
          id="at-name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Session-Timeout or Mikrotik-Rate-Limit"
          required
        />
        <p className="text-[10px] text-muted-foreground">
          Standard attributes use dashes (e.g. <code>User-Name</code>). Vendor attributes typically prefix the vendor name.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Data Type</Label>
          <Select
            value={form.type}
            onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ATTR_TYPES).map(([val, meta]) => (
                <SelectItem key={val} value={val}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Usage</Label>
          <Select
            value={form.attrType}
            onValueChange={(v) => setForm((p) => ({ ...p, attrType: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="check">Check (request validation)</SelectItem>
              <SelectItem value="reply">Reply (return to NAS)</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="at-vendor">Vendor</Label>
        <Input
          id="at-vendor"
          value={form.vendor}
          onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))}
          placeholder="Leave blank for standard attributes"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="at-desc">Description</Label>
        <Textarea
          id="at-desc"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="What does this attribute control?"
          rows={2}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.name}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Create Attribute"}
        </Button>
      </DialogFooter>
    </form>
  );
}
