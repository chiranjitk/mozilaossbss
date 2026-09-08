// =====================================================================
// ANNOUNCEMENTS CLIENT — system-wide banners & alerts
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
import { Switch } from "@/components/ui/switch";
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
import { format, formatDistanceToNow, isPast, isFuture } from "date-fns";
import {
  Megaphone,
  Plus,
  Edit,
  Trash2,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  level: string;
  audience: string;
  dismissible: boolean;
  activeFrom: string;
  activeUntil: string | null;
  createdAt: string;
}

interface AnnouncementFormValues {
  title: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  audience: "all" | "admins" | "technicians" | "agents";
  dismissible: boolean;
  activeFrom?: string;
  activeUntil?: string | null;
}

const LEVELS = [
  { value: "info", label: "Info", icon: Info, color: "text-info", bg: "bg-info/10" },
  {
    value: "success",
    label: "Success",
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    value: "warning",
    label: "Warning",
    icon: AlertTriangle,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    value: "error",
    label: "Error",
    icon: AlertOctagon,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
];

const AUDIENCES = [
  { value: "all", label: "All Users" },
  { value: "admins", label: "Admins" },
  { value: "technicians", label: "Technicians" },
  { value: "agents", label: "Agents" },
];

async function fetchAnnouncements(params: {
  page: number;
  pageSize: number;
  search: string;
  level: string;
  audience: string;
}): Promise<{ data: AnnouncementItem[]; total: number }> {
  const url = new URL("/api/v1/announcements", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.level && params.level !== "all") url.searchParams.set("level", params.level);
  if (params.audience && params.audience !== "all")
    url.searchParams.set("audience", params.audience);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch announcements");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function saveAnnouncement(
  values: AnnouncementFormValues & { id?: string }
): Promise<void> {
  const isEdit = !!values.id;
  const res = await fetch(
    isEdit ? `/api/v1/announcements/${values.id}` : "/api/v1/announcements",
    {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save announcement");
  }
}

async function deleteAnnouncement(id: string): Promise<void> {
  const res = await fetch(`/api/v1/announcements/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete announcement");
  }
}

export function AnnouncementsClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AnnouncementItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [
      "announcements",
      { page, pageSize, search, levelFilter, audienceFilter },
    ],
    queryFn: () =>
      fetchAnnouncements({
        page,
        pageSize,
        search,
        level: levelFilter,
        audience: audienceFilter,
      }),
    placeholderData: (prev) => prev,
  });

  const saveMutation = useMutation({
    mutationFn: (values: AnnouncementFormValues & { id?: string }) =>
      saveAnnouncement(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement saved");
      setCreateOpen(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (item: AnnouncementItem) => {
      // toggle dismissible
      const res = await fetch(`/api/v1/announcements/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissible: !item.dismissible }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "Failed to toggle");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error("Toggle failed", { description: e.message }),
  });

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    setPage(1);
  }, []);

  const columns = useMemo<ColumnDef<AnnouncementItem>[]>(
    () => [
      {
        id: "title",
        header: "Title",
        cell: ({ row }) => {
          const level = LEVELS.find((l) => l.value === row.original.level) ?? LEVELS[0];
          const Icon = level.icon;
          return (
            <div className="max-w-md flex items-start gap-2">
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", level.color)} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{row.original.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {row.original.message}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "level",
        header: "Level",
        cell: ({ row }) => {
          const level = LEVELS.find((l) => l.value === row.original.level);
          return (
            <span
              className={cn(
                "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium capitalize",
                level?.bg,
                level?.color
              )}
            >
              {row.original.level}
            </span>
          );
        },
      },
      {
        id: "audience",
        header: "Audience",
        cell: ({ row }) => {
          const aud = AUDIENCES.find((a) => a.value === row.original.audience);
          return (
            <span className="text-xs capitalize text-muted-foreground">
              {aud?.label ?? row.original.audience}
            </span>
          );
        },
      },
      {
        id: "activeFrom",
        header: "Active Window",
        cell: ({ row }) => {
          const from = new Date(row.original.activeFrom);
          const until = row.original.activeUntil ? new Date(row.original.activeUntil) : null;
          const now = new Date();
          const isLive = from <= now && (!until || until > now);
          const isScheduled = isFuture(from);
          const isExpired = until && isPast(until);
          return (
            <div className="flex flex-col">
              <span className="text-xs">
                {format(from, "MMM d")} →{" "}
                {until ? format(until, "MMM d, yyyy") : "∞"}
              </span>
              <span
                className={cn(
                  "text-[10px]",
                  isLive
                    ? "text-success"
                    : isExpired
                    ? "text-destructive"
                    : isScheduled
                    ? "text-info"
                    : "text-muted-foreground"
                )}
              >
                {isLive
                  ? "Live now"
                  : isExpired
                  ? "Expired"
                  : isScheduled
                  ? `Starts ${formatDistanceToNow(from, { addSuffix: true })}`
                  : "—"}
              </span>
            </div>
          );
        },
      },
      {
        id: "dismissible",
        header: "Dismissible",
        cell: ({ row }) => (
          <Switch
            checked={row.original.dismissible}
            onCheckedChange={() => toggleMutation.mutate(row.original)}
            aria-label="Toggle dismissible"
          />
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
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
              aria-label="Edit announcement"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete announcement"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [toggleMutation]
  );

  const announcements = data?.data ?? [];
  const totalAll = data?.total ?? 0;
  const now = new Date();
  const liveCount = announcements.filter((a) => {
    const from = new Date(a.activeFrom);
    const until = a.activeUntil ? new Date(a.activeUntil) : null;
    return from <= now && (!until || until > now);
  }).length;
  const warningCount = announcements.filter((a) => a.level === "warning" || a.level === "error").length;

  return (
    <>
      <PageHeader
        title="Announcements"
        description="System-wide banners and alerts shown to your team. Schedule by date window and target specific audiences."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Announcement
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Megaphone className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalAll}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{liveCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Live Now
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{warningCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Warnings / Errors
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <Select
          value={levelFilter}
          onValueChange={(v) => {
            setLevelFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {LEVELS.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={audienceFilter}
          onValueChange={(v) => {
            setAudienceFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All audiences</SelectItem>
            {AUDIENCES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={announcements}
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
        searchPlaceholder="Search by title or message…"
        emptyMessage="No announcements"
        emptyDescription="Create an announcement to broadcast alerts to your team."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-brand" /> New Announcement
            </DialogTitle>
            <DialogDescription>
              Banners appear at the top of the app for the selected audience.
            </DialogDescription>
          </DialogHeader>
          <AnnouncementForm
            isSaving={saveMutation.isPending}
            onSave={(values) => saveMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-brand" /> Edit Announcement
            </DialogTitle>
            <DialogDescription>
              Update <span className="font-medium text-foreground">{editTarget?.title}</span>
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <AnnouncementForm
              key={editTarget.id}
              initial={editTarget}
              isSaving={saveMutation.isPending}
              onSave={(values) =>
                saveMutation.mutate({ ...values, id: editTarget.id })
              }
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
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.title}</strong>. This action cannot be undone.
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
// FORM
// ---------------------------------------------------------------------

function AnnouncementForm({
  initial,
  isSaving,
  onSave,
}: {
  initial?: AnnouncementItem;
  isSaving: boolean;
  onSave: (values: AnnouncementFormValues) => void;
}) {
  const toLocalInput = (date: string | Date) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().slice(0, 16);
  };

  const [form, setForm] = useState<{
    title: string;
    message: string;
    level: AnnouncementFormValues["level"];
    audience: AnnouncementFormValues["audience"];
    dismissible: boolean;
    activeFrom: string;
    activeUntil: string;
  }>({
    title: initial?.title ?? "",
    message: initial?.message ?? "",
    level: (initial?.level as AnnouncementFormValues["level"]) ?? "info",
    audience: (initial?.audience as AnnouncementFormValues["audience"]) ?? "all",
    dismissible: initial?.dismissible ?? true,
    activeFrom: initial ? toLocalInput(initial.activeFrom) : toLocalInput(new Date()),
    activeUntil: initial?.activeUntil ? toLocalInput(initial.activeUntil) : "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title: form.title,
          message: form.message,
          level: form.level,
          audience: form.audience,
          dismissible: form.dismissible,
          activeFrom: new Date(form.activeFrom).toISOString(),
          activeUntil:
            form.activeUntil && form.activeUntil.trim() !== ""
              ? new Date(form.activeUntil).toISOString()
              : null,
        });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="an-title">Title *</Label>
        <Input
          id="an-title"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="Scheduled Maintenance Window"
          required
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="an-message">Message *</Label>
        <Textarea
          id="an-message"
          value={form.message}
          onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          placeholder="The platform will be unavailable on Saturday 2 AM – 4 AM IST for routine maintenance."
          rows={3}
          required
          maxLength={2000}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Level</Label>
          <Select
            value={form.level}
            onValueChange={(v: AnnouncementFormValues["level"]) =>
              setForm((p) => ({ ...p, level: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Audience</Label>
          <Select
            value={form.audience}
            onValueChange={(v: AnnouncementFormValues["audience"]) =>
              setForm((p) => ({ ...p, audience: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCES.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="an-from">Active From</Label>
          <Input
            id="an-from"
            type="datetime-local"
            value={form.activeFrom}
            onChange={(e) => setForm((p) => ({ ...p, activeFrom: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="an-until">Active Until (blank = no end)</Label>
          <Input
            id="an-until"
            type="datetime-local"
            value={form.activeUntil}
            onChange={(e) => setForm((p) => ({ ...p, activeUntil: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-xs font-medium">Dismissible</p>
          <p className="text-[11px] text-muted-foreground">
            Allow users to dismiss this banner.
          </p>
        </div>
        <Switch
          checked={form.dismissible}
          onCheckedChange={(c) => setForm((p) => ({ ...p, dismissible: c }))}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !form.title || !form.message}>
          {isSaving ? "Saving…" : initial ? "Save Changes" : "Publish"}
        </Button>
      </DialogFooter>
    </form>
  );
}
