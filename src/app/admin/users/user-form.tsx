// =====================================================================
// USER FORM — create / edit user with role multi-select
// Uses React Hook Form + Zod for client validation.
// =====================================================================

"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState } from "@/components/common/states";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useState } from "react";

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

interface UserFormProps {
  mode: "create" | "edit";
  user?: {
    id: string;
    email: string;
    username: string;
    name: string | null;
    phone: string | null;
    status: string;
    roles: Array<{ id: string; name: string }>;
  };
  onSuccess?: () => void;
}

const createSchema = z.object({
  email: z.string().email("Valid email required"),
  username: z.string().min(3, "Min 3 characters").max(50),
  password: z.string().min(8, "Min 8 characters"),
  name: z.string().optional(),
  phone: z.string().optional(),
  roleIds: z.array(z.string()).min(1, "Select at least one role"),
});

const editSchema = z.object({
  email: z.string().email("Valid email required"),
  name: z.string().optional(),
  phone: z.string().optional(),
  status: z.enum(["active", "disabled", "locked", "invited"]),
  password: z.string().min(8).optional().or(z.literal("")),
  roleIds: z.array(z.string()).min(1, "Select at least one role"),
});

type CreateFormValues = z.infer<typeof createSchema>;
type EditFormValues = z.infer<typeof editSchema>;

async function fetchRoles(): Promise<Role[]> {
  const res = await fetch("/api/v1/roles", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data.roles;
}

export function UserForm({ mode, user, onSuccess }: UserFormProps) {
  const queryClient = useQueryClient();
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: fetchRoles,
  });

  const isCreate = mode === "create";
  // Initial selected roles derived once from the user prop (no effect needed)
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    user?.roles.map((r) => r.id) ?? []
  );

  const form = useForm<CreateFormValues | EditFormValues>({
    resolver: zodResolver(isCreate ? createSchema : editSchema),
    defaultValues: isCreate
      ? { email: "", username: "", password: "", name: "", phone: "", roleIds: [] }
      : {
          email: user?.email ?? "",
          name: user?.name ?? "",
          phone: user?.phone ?? "",
          status: (user?.status as "active" | "disabled" | "locked" | "invited") ?? "active",
          password: "",
          roleIds: user?.roles.map((r) => r.id) ?? [],
        },
  });

  const mutation = useMutation({
    mutationFn: async (values: CreateFormValues | EditFormValues) => {
      const payload = { ...values, roleIds: selectedRoles };
      if (isCreate) {
        const res = await fetch("/api/v1/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message ?? "Failed to create user");
        }
        return res.json();
      } else {
        const body: Record<string, unknown> = { ...payload };
        // Don't send empty password on edit
        if (!body.password) delete body.password;
        const res = await fetch(`/api/v1/users/${user!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message ?? "Failed to update user");
        }
        return res.json();
      }
    },
    onSuccess: () => {
      toast.success(isCreate ? "User created" : "User updated");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onSuccess?.();
    },
    onError: (e: Error) => {
      toast.error(isCreate ? "Create failed" : "Update failed", {
        description: e.message,
      });
    },
  });

  if (rolesLoading) return <LoadingState label="Loading roles…" />;

  const toggleRole = (roleId: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
      className="space-y-4"
    >
      {isCreate && (
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            {...form.register("username")}
            placeholder="e.g. jsmith"
            className="font-mono"
          />
          {form.formState.errors.username && (
            <p className="text-xs text-destructive">
              {form.formState.errors.username.message as string}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" {...form.register("name")} placeholder="John Smith" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            {...form.register("email")}
            placeholder="john@example.com"
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">
              {form.formState.errors.email.message as string}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" {...form.register("phone")} placeholder="+1 555 123 4567" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">
          {isCreate ? "Password" : "New password (leave blank to keep current)"}
        </Label>
        <Input
          id="password"
          type="password"
          {...form.register("password")}
          placeholder={isCreate ? "At least 8 characters" : "••••••••"}
        />
        {form.formState.errors.password && (
          <p className="text-xs text-destructive">
            {form.formState.errors.password.message as string}
          </p>
        )}
      </div>

      {!isCreate && (
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            {...form.register("status")}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="locked">Locked</option>
            <option value="invited">Invited</option>
          </select>
        </div>
      )}

      {/* Role multi-select */}
      <div className="space-y-2">
        <Label>Roles</Label>
        <div className="rounded-md border border-border max-h-48 overflow-y-auto scroll-thin divide-y divide-border">
          {roles?.map((role) => (
            <label
              key={role.id}
              className="flex items-start gap-3 p-2.5 hover:bg-muted/40 cursor-pointer transition-colors"
            >
              <Checkbox
                checked={selectedRoles.includes(role.id)}
                onCheckedChange={() => toggleRole(role.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{role.name}</span>
                  {role.isSystem && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      system
                    </span>
                  )}
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {role.description}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
        {selectedRoles.length === 0 && (
          <p className="text-xs text-warning">Select at least one role</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="submit"
          disabled={mutation.isPending || selectedRoles.length === 0}
        >
          {mutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {isCreate ? "Create user" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
