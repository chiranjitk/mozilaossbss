// =====================================================================
// MODULE MANAGER CLIENT — full module lifecycle UI
// Lists all 13 modules with: status, health, worker, dependencies,
// resources, permissions count, enable/disable toggle with confirmation.
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Boxes,
  Search,
  Cpu,
  Activity,
  Shield,
  Plug,
  CalendarClock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleState {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  industries: string[];
  dependencies: string[];
  permissions: string[];
  resources: string[];
  hasWorker: boolean;
  requiresExternalConnection: boolean;
  coreModule: boolean;
  licenseTier?: string;
  enabled: boolean;
  licensed: boolean;
  health: string;
  workerStatus: string;
  dependenciesMet: boolean;
}

interface ModulesResponse {
  modules: ModuleState[];
}

async function fetchModules(): Promise<ModuleState[]> {
  const res = await fetch("/api/v1/modules", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load modules");
  const json = await res.json();
  return json.data.modules;
}

async function toggleModule(moduleId: string, enabled: boolean): Promise<void> {
  const res = await fetch("/api/v1/modules", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moduleId, enabled }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to toggle module");
  }
}

const RESOURCE_ICONS: Record<string, typeof Cpu> = {
  "frontend-only": Cpu,
  "full-stack": Boxes,
  "with-worker": Activity,
  "external-connection": Plug,
  "scheduled-jobs": CalendarClock,
};

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core",
  customer: "Customer",
  aaa: "AAA & Access",
  network: "Network",
  policy: "Policy",
  monitoring: "Monitoring",
  devices: "Devices",
  services: "Services",
  operations: "Operations",
  finance: "Finance",
  ai: "AI",
  communication: "Communication",
};

export function ModuleManagerClient() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pendingToggle, setPendingToggle] = useState<{
    module: ModuleState;
    enabled: boolean;
  } | null>(null);

  const { data: modules, isLoading, isError, refetch } = useQuery<ModuleState[]>({
    queryKey: ["modules"],
    queryFn: fetchModules,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ moduleId, enabled }: { moduleId: string; enabled: boolean }) =>
      toggleModule(moduleId, enabled),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(
        vars.enabled ? "Module enabled" : "Module disabled",
        { description: "Navigation and workers updated." }
      );
    },
    onError: (err: Error) => {
      toast.error("Failed to toggle module", { description: err.message });
    },
  });

  const filtered = useMemo(() => {
    if (!modules) return [];
    return modules.filter((m) => {
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      if (statusFilter === "enabled" && !m.enabled) return false;
      if (statusFilter === "disabled" && m.enabled) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (
          !m.name.toLowerCase().includes(q) &&
          !m.description.toLowerCase().includes(q) &&
          !m.id.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [modules, categoryFilter, statusFilter, debouncedSearch]);

  const stats = useMemo(() => {
    if (!modules) return { enabled: 0, disabled: 0, healthy: 0, withWorkers: 0 };
    return {
      enabled: modules.filter((m) => m.enabled).length,
      disabled: modules.filter((m) => !m.enabled).length,
      healthy: modules.filter((m) => m.enabled && m.health === "healthy").length,
      withWorkers: modules.filter((m) => m.hasWorker && m.enabled).length,
    };
  }, [modules]);

  const categories = useMemo(() => {
    if (!modules) return [];
    return Array.from(new Set(modules.map((m) => m.category)));
  }, [modules]);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Module Manager" description="Enable, disable, and monitor platform modules." />
        <LoadingState label="Loading modules…" />
      </>
    );
  }

  if (isError || !modules) {
    return (
      <>
        <PageHeader title="Module Manager" description="Enable, disable, and monitor platform modules." />
        <ErrorState
          title="Failed to load modules"
          description="There was an error fetching the module registry."
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Module Manager"
        description="Enable, disable, and monitor platform modules. Disabled modules consume zero runtime resources."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <StatTile label="Enabled" value={stats.enabled} icon={CheckCircle2} accent="success" />
        <StatTile label="Disabled" value={stats.disabled} icon={XCircle} accent="muted" />
        <StatTile label="Healthy" value={stats.healthy} icon={Activity} accent="brand" />
        <StatTile label="Active Workers" value={stats.withWorkers} icon={Cpu} accent="warning" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Module grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No modules match your filters"
          description="Try adjusting the search or filters."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((mod) => (
            <ModuleCard
              key={mod.id}
              module={mod}
              allModules={modules}
              onToggle={(enabled) => setPendingToggle({ module: mod, enabled })}
            />
          ))}
        </div>
      )}

      {/* Confirm toggle dialog */}
      <Dialog
        open={!!pendingToggle}
        onOpenChange={(open) => !open && setPendingToggle(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingToggle?.enabled ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-warning" />
              )}
              {pendingToggle?.enabled ? "Enable module" : "Disable module"}
            </DialogTitle>
            <DialogDescription>
              {pendingToggle?.enabled
                ? `Enable "${pendingToggle?.module?.name}"? This will start its workers, open required connections, and add its navigation.`
                : `Disable "${pendingToggle?.module?.name}"? This will immediately stop its workers, close connections, and remove its navigation. Existing data is preserved.`}
            </DialogDescription>
          </DialogHeader>

          {/* Show dependencies when enabling */}
          {pendingToggle?.enabled && (pendingToggle?.module?.dependencies?.length ?? 0) > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
              <p className="font-medium mb-1.5">Required dependencies (will be auto-enabled):</p>
              <div className="flex flex-wrap gap-1.5">
                {pendingToggle?.module?.dependencies?.map((depId) => {
                  const dep = modules.find((m) => m.id === depId);
                  return (
                    <Badge key={depId} variant="outline" className="font-normal">
                      {dep?.name ?? depId}
                      {dep?.enabled && (
                        <CheckCircle2 className="ml-1 h-3 w-3 text-success" />
                      )}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Warning for dependents when disabling */}
          {pendingToggle && !pendingToggle.enabled && (
            <DependentsWarning moduleId={pendingToggle?.module?.id ?? ""} modules={modules} />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingToggle(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingToggle?.enabled ? "default" : "destructive"}
              disabled={toggleMutation.isPending}
              onClick={() => {
                if (!pendingToggle) return;
                toggleMutation.mutate(
                  { moduleId: pendingToggle?.module?.id ?? "", enabled: pendingToggle.enabled },
                  {
                    onSettled: () => setPendingToggle(null),
                  }
                );
              }}
            >
              {toggleMutation.isPending
                ? "Working…"
                : pendingToggle?.enabled
                  ? "Enable module"
                  : "Disable module"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------
// MODULE CARD
// ---------------------------------------------------------------------

function ModuleCard({
  module: mod,
  allModules,
  onToggle,
}: {
  module: ModuleState;
  allModules: ModuleState[];
  onToggle: (enabled: boolean) => void;
}) {
  // Pick an icon name based on category for visual identity
  const iconName =
    mod.category === "core" ? "Boxes"
    : mod.category === "aaa" ? "KeyRound"
    : mod.category === "customer" ? "Users"
    : mod.category === "network" ? "Network"
    : mod.category === "policy" ? "Shield"
    : mod.category === "monitoring" ? "Activity"
    : mod.category === "finance" ? "DollarSign"
    : mod.category === "operations" ? "Wrench"
    : mod.category === "devices" ? "Router"
    : mod.category === "ai" ? "Sparkles"
    : mod.category === "communication" ? "MessageSquare"
    : "Boxes";

  return (
    <Card className={cn("flex flex-col", mod.enabled && "ring-1 ring-brand/30")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                mod.enabled
                  ? "bg-brand/10 text-brand"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Icon name={iconName} className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold truncate">{mod.name}</h3>
                {mod.coreModule && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    CORE
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize">
                  {CATEGORY_LABELS[mod.category] ?? mod.category}
                </Badge>
                {mod.licenseTier && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize">
                    {mod.licenseTier}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{mod.description}</p>
            </div>
          </div>
          <Switch
            checked={mod.enabled}
            disabled={mod.coreModule}
            onCheckedChange={(checked) => onToggle(checked)}
            aria-label={`Toggle ${mod.name}`}
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pt-0">
        {/* Status row */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {mod.enabled ? (
            <>
              <StatusBadge status={mod.health} />
              {mod.hasWorker && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  Worker: <span className="font-medium">{mod.workerStatus}</span>
                </span>
              )}
              {!mod.dependenciesMet && (
                <span className="flex items-center gap-1 text-warning">
                  <AlertTriangle className="h-3 w-3" /> Missing dependencies
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Disabled — no runtime resources consumed</span>
          )}
        </div>

        {/* Resources */}
        <div className="flex items-center gap-2 flex-wrap">
          {mod.resources.map((r) => {
            const Icon = RESOURCE_ICONS[r] ?? Cpu;
            return (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <Icon className="h-3 w-3" />
                {r.replace(/-/g, " ")}
              </span>
            );
          })}
        </div>

        {/* Dependencies */}
        {mod.dependencies.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Depends on
            </p>
            <div className="flex flex-wrap gap-1.5">
              {mod.dependencies.map((depId) => {
                const dep = allModules.find((m) => m.id === depId);
                return (
                  <Badge key={depId} variant="outline" className="text-[10px] font-normal py-0">
                    {dep?.name ?? depId}
                    {dep?.enabled ? (
                      <CheckCircle2 className="ml-1 h-2.5 w-2.5 text-success" />
                    ) : (
                      <XCircle className="ml-1 h-2.5 w-2.5 text-muted-foreground" />
                    )}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer: permissions count */}
        <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            {mod.permissions.length} permissions
          </span>
          <span>v{mod.version}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
// DEPENDENTS WARNING — when disabling, show what else depends on this
// ---------------------------------------------------------------------

function DependentsWarning({
  moduleId,
  modules,
}: {
  moduleId: string;
  modules: ModuleState[];
}) {
  const dependents = modules.filter(
    (m) => m.enabled && m.dependencies.includes(moduleId)
  );

  if (dependents.length === 0) return null;

  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
      <p className="font-medium text-warning mb-1.5 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        {dependents.length} module(s) depend on this and will also be affected:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {dependents.map((d) => (
          <Badge key={d.id} variant="outline" className="font-normal">
            {d.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// STAT TILE
// ---------------------------------------------------------------------

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Cpu;
  accent: "success" | "muted" | "brand" | "warning";
}) {
  const accentClass = {
    success: "bg-success/10 text-success",
    muted: "bg-muted text-muted-foreground",
    brand: "bg-brand/10 text-brand",
    warning: "bg-warning/10 text-warning",
  }[accent];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", accentClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  );
}
