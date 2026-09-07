// =====================================================================
// USERS CLIENT — list, create, edit, delete, reset password, unlock
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Checkbox } from "@/components/ui/checkbox";
import { UserForm } from "./user-form";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  UserPlus,
  MoreHorizontal,
  KeyRound,
  LockOpen,
  Trash2,
  Edit,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserListItem {
  id: string;
  email: string;
  username: string;
  name: string | null;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  roles: Array<{ id: string; name: string }>;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

async function fetchUsers(params: {
  page: number;
  pageSize: number;
  search: string;
}): Promise<{ data: UserListItem[]; total: number }> {
  const url = new URL("/api/v1/users", window.location.origin);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch users");
  const json = await res.json();
  return { data: json.data, total: json.meta.total };
}

async function fetchRoles(): Promise<Role[]> {
  const res = await fetch("/api/v1/roles", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data.roles;
}

async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/v1/users/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to delete user");
  }
}

async function resetPassword(id: string, password: string): Promise<void> {
  const res = await fetch(`/api/v1/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? "Failed to reset password");
  }
}

async function unlockUser(id: string): Promise<void> {
  const res = await fetch(`/api/v1/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active" }),
  });
  if (!res.ok) throw new Error("Failed to unlock user");
}

export function UsersClient() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);
  const [resetTarget, setResetTarget] = useState<UserListItem | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["users", { page, pageSize, search }],
    queryFn: () => fetchUsers({ page, pageSize, search }),
    placeholderData: (prev) => prev,
  });

  useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetPassword(id, password),
    onSuccess: () => {
      toast.success("Password reset");
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error("Reset failed", { description: e.message }),
  });

  const unlockMutation = useMutation({
    mutationFn: (id: string) => unlockUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User unlocked");
    },
    onError: () => toast.error("Unlock failed"),
  });

  const columns = useMemo<ColumnDef<UserListItem>[]>(
    () => [
      {
        id: "user",
        header: "User",
        cell: ({ row }) => {
          const u = row.original;
          const initials = (u.name ?? u.username)
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-brand/15 text-brand text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {u.name ?? u.username}
                </p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "username",
        header: "Username",
        cell: ({ row }) => (
          <code className="text-xs font-mono">{row.original.username}</code>
        ),
      },
      {
        id: "roles",
        header: "Roles",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r.id} variant="outline" className="text-[10px] font-normal py-0">
                {r.name}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "lastLoginAt",
        header: "Last Login",
        cell: ({ row }) => {
          const ll = row.original.lastLoginAt;
          return (
            <div className="text-xs">
              {ll ? (
                <>
                  <p>{formatDistanceToNow(new Date(ll), { addSuffix: true })}</p>
                  <p className="text-muted-foreground">{row.original.lastLoginIp}</p>
                </>
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const u = row.original;
          const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setEditUser(u)}>
                    <Edit className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                  {locked && (
                    <DropdownMenuItem onClick={() => unlockMutation.mutate(u.id)}>
                      <LockOpen className="mr-2 h-3.5 w-3.5" /> Unlock
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setResetTarget(u)}>
                    <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteTarget(u)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [unlockMutation]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage user accounts, roles, and access. Backend-enforced RBAC."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-2 h-3.5 w-3.5" /> New User
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        error={error?.message}
        onRetry={() => refetch()}
        pagination={{
          page,
          pageSize,
          total: data?.total ?? 0,
        }}
        onPaginationChange={(p, ps) => {
          setPage(p);
          setPageSize(ps);
        }}
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by name, email, or username…"
        emptyMessage="No users found"
        emptyDescription="Create your first user to get started."
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create new user</DialogTitle>
            <DialogDescription>
              Add a new user account and assign roles. The user will be active immediately.
            </DialogDescription>
          </DialogHeader>
          <UserForm
            mode="create"
            onSuccess={() => {
              setCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: ["users"] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update {editUser?.name ?? editUser?.username}&apos;s profile and roles.
            </DialogDescription>
          </DialogHeader>
          {editUser && (
            <UserForm
              key={editUser.id}
              mode="edit"
              user={editUser}
              onSuccess={() => {
                setEditUser(null);
                queryClient.invalidateQueries({ queryKey: ["users"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name ?? deleteTarget?.username}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for{" "}
              <span className="font-medium text-foreground">{resetTarget?.username}</span>.
              The user will need to use this new password on next login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={newPassword.length < 8 || resetMutation.isPending}
              onClick={() =>
                resetTarget &&
                resetMutation.mutate({ id: resetTarget.id, password: newPassword })
              }
            >
              {resetMutation.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
