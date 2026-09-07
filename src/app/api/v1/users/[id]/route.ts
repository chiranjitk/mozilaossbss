// =====================================================================
// USER DETAIL API — GET, PATCH, DELETE a single user
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requirePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import {
  getUserById,
  updateUser,
  deleteUser,
  resetUserPassword,
  unlockUser,
} from "@/core/repositories/user";
import { eventBus, EVENTS } from "@/core/events/bus";

export const dynamic = "force-dynamic";

// GET /api/v1/users/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("user.manage");
  const id = new URL(req.url).pathname.split("/").pop()!;

  const user = await getUserById(ctx.tenantId, id);
  if (!user) {
    throw ApiError.notFound("User", id);
  }

  return ok({
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    lastLoginIp: user.lastLoginIp,
    failedAttempts: user.failedAttempts,
    lockedUntil: user.lockedUntil,
    roles: user.userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  status: z.enum(["active", "disabled", "locked", "invited"]).optional(),
  password: z.string().min(8).optional(),
  roleIds: z.array(z.string()).optional(),
});

// PATCH /api/v1/users/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("user.manage");
  const id = new URL(req.url).pathname.split("/").pop()!;

  const existing = await getUserById(ctx.tenantId, id);
  if (!existing) {
    throw ApiError.notFound("User", id);
  }

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  // Prevent self-disabling / self-deletion of the last admin (basic safeguard)
  if (parsed.data.status === "disabled" && id === ctx.userId) {
    throw ApiError.businessRule("You cannot disable your own account");
  }

  const updated = await updateUser(ctx.tenantId, id, parsed.data);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "user.update",
    module: "core",
    resource: "User",
    resourceId: id,
    requestId,
    oldValue: {
      email: existing.email,
      name: existing.name,
      status: existing.status,
      roleIds: existing.userRoles.map((ur) => ur.role.id),
    },
    newValue: parsed.data,
    message: `Updated user ${updated.username}`,
  });

  return ok({
    id: updated.id,
    email: updated.email,
    username: updated.username,
    name: updated.name,
    status: updated.status,
    roles: updated.userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
  });
});

// DELETE /api/v1/users/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("user.manage");
  const id = new URL(req.url).pathname.split("/").pop()!;

  const existing = await getUserById(ctx.tenantId, id);
  if (!existing) {
    throw ApiError.notFound("User", id);
  }

  if (id === ctx.userId) {
    throw ApiError.businessRule("You cannot delete your own account");
  }

  await deleteUser(ctx.tenantId, id);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "user.delete",
    module: "core",
    resource: "User",
    resourceId: id,
    requestId,
    oldValue: { username: existing.username, email: existing.email },
    message: `Deleted user ${existing.username}`,
  });

  await eventBus.emit(
    EVENTS.USER_LOGOUT,
    { userId: id, reason: "deleted" },
    { tenantId: ctx.tenantId, source: "core.users", requestId }
  );

  return ok({ deleted: true, id });
});
