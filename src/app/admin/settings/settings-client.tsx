// =====================================================================
// SETTINGS CLIENT — grouped key/value editor with categories
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plus, Settings, Save, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingItem {
  id: string;
  key: string;
  value: string;
  encrypted: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

interface SettingCategory {
  category: string;
  items: SettingItem[];
}

interface SettingsData {
  settings: SettingCategory[];
}

async function fetchSettings(): Promise<SettingsData> {
  const res = await fetch("/api/v1/settings", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load settings");
  const json = await res.json();
  return json.data;
}

async function saveSetting(data: {
  key: string;
  value: string;
  category: string;
  encrypted: boolean;
}): Promise<void> {
  const res = await fetch("/api/v1/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save setting");
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  billing: "Billing",
  network: "Network",
  notification: "Notifications",
  ai: "AI",
  security: "Security",
  integration: "Integrations",
};

export function SettingsClient() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  const [editing, setEditing] = useState<SettingItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealMap, setRevealMap] = useState<Record<string, boolean>>({});

  const saveMutation = useMutation({
    mutationFn: saveSetting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Setting saved");
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="System Settings" description="Platform-wide configuration." />
        <LoadingState label="Loading settings…" />
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <PageHeader title="System Settings" description="Platform-wide configuration." />
        <ErrorState onRetry={() => refetch()} />
      </>
    );
  }

  const totalSettings = data.settings.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <>
      <PageHeader
        title="System Settings"
        description="Platform-wide configuration stored as tenant-scoped key/value pairs."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> Add Setting
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{totalSettings}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Settings</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{data.settings.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Categories</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {data.settings.flatMap((c) => c.items).filter((s) => s.encrypted).length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Encrypted</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Settings grouped by category */}
      {data.settings.length === 0 ? (
        <EmptyState
          title="No settings yet"
          description="Add your first configuration setting to customize platform behavior."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" /> Add Setting
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {data.settings.map((cat) => (
            <Card key={cat.category}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="capitalize">
                    {CATEGORY_LABELS[cat.category] ?? cat.category}
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0">
                    {cat.items.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-border">
                  {cat.items.map((s) => {
                    const revealed = revealMap[s.id];
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono font-medium">{s.key}</code>
                            {s.encrypted && (
                              <Badge variant="outline" className="text-[10px] py-0">
                                Encrypted
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {s.encrypted && !revealed ? (
                              "••••••••••••"
                            ) : (
                              <span className="font-mono break-all">{s.value}</span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Updated {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {s.encrypted && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setRevealMap((p) => ({ ...p, [s.id]: !p[s.id] }))
                              }
                            >
                              {revealed ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditing(s)}
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit setting" : "Add setting"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the value of this configuration setting."
                : "Add a new key/value configuration setting."}
            </DialogDescription>
          </DialogHeader>
          <SettingForm
            setting={editing}
            isSaving={saveMutation.isPending}
            onSave={(values) => saveMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SettingForm({
  setting,
  isSaving,
  onSave,
}: {
  setting: SettingItem | null;
  isSaving: boolean;
  onSave: (values: { key: string; value: string; category: string; encrypted: boolean }) => void;
}) {
  const [key, setKey] = useState(setting?.key ?? "");
  const [value, setValue] = useState(setting?.value ?? "");
  const [category, setCategory] = useState(setting?.category ?? "general");
  const [encrypted, setEncrypted] = useState(setting?.encrypted ?? false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ key, value, category, encrypted });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="setting-key">Key</Label>
        <Input
          id="setting-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={!!setting}
          placeholder="e.g. smtp.host"
          className="font-mono"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setting-value">Value</Label>
        <Input
          id="setting-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Setting value"
          className="font-mono"
          type={encrypted ? "password" : "text"}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setting-category">Category</Label>
        <select
          id="setting-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={!!setting}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
          <option value="general">General</option>
        </select>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={encrypted}
          onCheckedChange={(v) => setEncrypted(v === true)}
        />
        <span className="text-sm">Encrypt this value (for secrets)</span>
      </label>
      <DialogFooter>
        <Button type="submit" disabled={isSaving || !key || !value}>
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          <Save className="mr-2 h-3.5 w-3.5" />
          {setting ? "Save changes" : "Add setting"}
        </Button>
      </DialogFooter>
    </form>
  );
}
