// =====================================================================
// ROLES CLIENT — list roles, create/edit, permission matrix editor
// =====================================================================

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  Edit,
  Trash2,
  Lock,
  Users,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RolePermission {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string | null;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
  createdAt: string;
}

interface RolesData {
  roles: Role[];
  permissions: RolePermission[];
  permissionsByModule: Array<{
    module: string;
    permissions: RolePermission[];
  }>;
}

async function fetchRoles(): Promise<RolesData> {
  const res = await fetch("/api/v1/roles", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load roles");
  const json = await res.json();
  return json.data;
}

async function saveRole(data: {
  id?: string;
  name: string;
  description?: string;
  permissionIds: string[];
}): Promise<void> {
  const isEdit = !!data.id;
  const res = await fetch(isEdit ? `/api/v1/roles/${data.id}` : "/api/v1/roles", {
    method: isEdit ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      permissionIds: data.permissionIds,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to save role");
  }
}

async function deleteRole(id: string): Promise<void> {
  const res = await fetch(`/api/v1/roles/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete role");
  }
}

export function RolesClient() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<RolesData>({
    queryKey: ["roles"],
    queryFn: fetchRoles,
  });

  const saveMutation = useMutation({
    mutationFn: saveRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role saved");
      setEditing(null);
      setCreating(false);
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Role deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Roles & Permissions" description="Manage roles and their permission grants." />
        <LoadingState label="Loading roles…" />
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <PageHeader title="Roles & Permissions" description="Manage roles and their permission grants." />
        <ErrorState onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Manage roles and their permission grants. System roles are protected."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Role
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{data.roles.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Roles</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {data.roles.filter((r) => r.isSystem).length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">System Roles</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-success">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {data.roles.reduce((sum, r) => sum + r.userCount, 0)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">User Assignments</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-warning">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums">{data.permissions.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Permissions</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Role grid */}
      {data.roles.length === 0 ? (
        <EmptyState
          title="No roles yet"
          description="Create your first role to assign permissions to users."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" /> New Role
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.roles.map((role) => (
            <Card key={role.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                      <ShieldCheck className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{role.name}</h3>
                        {role.isSystem && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            <Lock className="mr-1 h-2.5 w-2.5" /> SYSTEM
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {role.description ?? "No description"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditing(role)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    {!role.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(role)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {role.userCount} user{role.userCount !== 1 ? "s" : ""} assigned
                  </span>
                  <span className="text-muted-foreground">
                    {role.permissions.length} permissions
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.slice(0, 8).map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] font-mono py-0">
                      {p}
                    </Badge>
                  ))}
                  {role.permissions.length > 8 && (
                    <Badge variant="outline" className="text-[10px] py-0">
                      +{role.permissions.length - 8} more
                    </Badge>
                  )}
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
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit role: ${editing.name}` : "Create new role"}
            </DialogTitle>
            <DialogDescription>
              {editing?.isSystem
                ? "This is a system role. Only the description can be modified."
                : "Assign permissions by module. Changes take effect immediately for assigned users."}
            </DialogDescription>
          </DialogHeader>
          <RoleForm
            role={editing}
            permissionsByModule={data.permissionsByModule}
            isSaving={saveMutation.isPending}
            onSave={(values) => saveMutation.mutate({ ...values, id: editing?.id })}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span> role.
              Users assigned to this role must be reassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------
// ROLE FORM — name, description, permission matrix
// ---------------------------------------------------------------------

function RoleForm({
  role,
  permissionsByModule,
  isSaving,
  onSave,
}: {
  role: Role | null;
  permissionsByModule: RolesData["permissionsByModule"];
  isSaving: boolean;
  onSave: (values: { name: string; description: string; permissionIds: string[] }) => void;
}) {
  const isSystem = role?.isSystem ?? false;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(
      role
        ? permissionsByModule
            .flatMap((m) => m.permissions)
            .filter((p) => role.permissions.includes(p.key))
            .map((p) => p.id)
        : []
    )
  );

  const togglePermission = (id: string) => {
    if (isSystem) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModule = (modulePerms: RolePermission[]) => {
    if (isSystem) return;
    const allSelected = modulePerms.every((p) => selected.has(p.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        modulePerms.forEach((p) => next.delete(p.id));
      } else {
        modulePerms.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          description,
          permissionIds: Array.from(selected),
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSystem}
            placeholder="e.g. network_operator"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-desc">Description</Label>
          <Input
            id="role-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this role can do"
          />
        </div>
      </div>

      {/* Permission matrix */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Permissions ({selected.size} selected)</Label>
          {isSystem && (
            <Badge variant="outline" className="text-[10px]">
              <Lock className="mr-1 h-2.5 w-2.5" /> Read-only
            </Badge>
          )}
        </div>
        <div className="rounded-md border border-border max-h-[400px] overflow-y-auto scroll-thin">
          <Accordion type="multiple" className="w-full">
            {permissionsByModule.map((group) => {
              const allSelected = group.permissions.every((p) => selected.has(p.id));
              const someSelected = group.permissions.some((p) => selected.has(p.id));
              return (
                <AccordionItem key={group.module} value={group.module} className="border-b border-border last:border-b-0">
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-muted/40">
                    <div className="flex items-center gap-3 flex-1">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={() => toggleModule(group.permissions)}
                        disabled={isSystem}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-sm font-medium capitalize">{group.module}</span>
                      <Badge variant="outline" className="text-[10px] py-0 ml-auto mr-2">
                        {group.permissions.filter((p) => selected.has(p.id)).length}/{group.permissions.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                      {group.permissions.map((p) => (
                        <label
                          key={p.id}
                          className={cn(
                            "flex items-start gap-2.5 rounded p-1.5 cursor-pointer transition-colors",
                            isSystem ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={selected.has(p.id)}
                            onCheckedChange={() => togglePermission(p.id)}
                            disabled={isSystem}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <code className="text-xs font-mono">{p.key}</code>
                            {p.description && (
                              <p className="text-[10px] text-muted-foreground line-clamp-1">
                                {p.description}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isSaving || (!isSystem && name.length < 2)}>
          {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {role ? "Save changes" : "Create role"}
        </Button>
      </DialogFooter>
    </form>
  );
}
