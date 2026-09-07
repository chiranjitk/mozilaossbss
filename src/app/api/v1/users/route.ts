// =====================================================================
// USERS API — CRUD with RBAC, audit, and tenant isolation
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requirePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import {
  listUsers,
  createUser,
  getUserByUsername,
} from "@/core/repositories/user";
import { eventBus, EVENTS } from "@/core/events/bus";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/v1/users — paginated list with search/filter
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("user.manage");
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const roleId = url.searchParams.get("roleId") ?? undefined;

  const result = await listUsers(ctx.tenantId, { search, status, roleId }, url.searchParams);

  return paginated(
    result.data.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      name: u.name,
      phone: u.phone,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      lastLoginIp: u.lastLoginIp,
      failedAttempts: u.failedAttempts,
      lockedUntil: u.lockedUntil,
      roles: u.userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
      createdAt: u.createdAt,
    })),
    { page: result.page, pageSize: result.pageSize, total: result.total },
    requestId
  );
});

const createUserSchema = z.object({
  email: z.string().email("Invalid email"),
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
  phone: z.string().optional(),
  roleIds: z.array(z.string()).min(1, "At least one role is required"),
});

// POST /api/v1/users — create new user
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("user.manage");
  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  // Check duplicates
  const existingEmail = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existingEmail) {
    throw ApiError.duplicate("User", "email", parsed.data.email);
  }
  const existingUsername = await getUserByUsername(parsed.data.username);
  if (existingUsername) {
    throw ApiError.duplicate("User", "username", parsed.data.username);
  }

  // Validate roles exist
  const roles = await db.role.findMany({
    where: { id: { in: parsed.data.roleIds } },
  });
  if (roles.length !== parsed.data.roleIds.length) {
    throw ApiError.businessRule("One or more roles do not exist");
  }

  const user = await createUser({
    tenantId: ctx.tenantId,
    ...parsed.data,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "user.create",
    module: "core",
    resource: "User",
    resourceId: user.id,
    requestId,
    newValue: { email: user.email, username: user.username, name: user.name, roleIds: parsed.data.roleIds },
    message: `Created user ${user.username}`,
  });

  await eventBus.emit(
    EVENTS.USER_CREATED,
    { userId: user.id, username: user.username, email: user.email },
    { tenantId: ctx.tenantId, source: "core.users", requestId }
  );

  return created(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      status: user.status,
      roles: user.userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
    },
    requestId
  );
});
