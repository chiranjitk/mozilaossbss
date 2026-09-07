// =====================================================================
// ROLES & PERMISSIONS API
// GET: list roles with permissions + permission catalog grouped by module
// POST: create role
// PATCH: update role (name, description, permissionIds)
// DELETE: delete role (system roles protected)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, ApiError } from "@/core/api/errors";
import { requirePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { ALL_PERMISSIONS, MODULE_CATALOG } from "@/core/modules/catalog";

export const dynamic = "force-dynamic";

// GET /api/v1/roles
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("role.manage");

  const [roles, permissions] = await Promise.all([
    db.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }),
    db.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] }),
  ]);

  // Build permission catalog grouped by module (from the static catalog)
  const moduleCatalog = MODULE_CATALOG.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    permissions: m.permissions,
  }));

  // Group all permissions by module for the matrix view
  const permissionsByModule = permissions.reduce<Record<string, typeof permissions>>(
    (acc, p) => {
      (acc[p.module] ??= []).push(p);
      return acc;
    },
    {}
  );

  return ok({
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((rp) => rp.permission.key),
      createdAt: r.createdAt,
    })),
    permissions: permissions.map((p) => ({
      id: p.id,
      key: p.key,
      module: p.module,
      action: p.action,
      description: p.description,
    })),
    permissionsByModule: Object.entries(permissionsByModule).map(([module, perms]) => ({
      module,
      permissions: perms.map((p) => ({ id: p.id, key: p.key, action: p.action, description: p.description })),
    })),
    moduleCatalog,
  });
});

const createRoleSchema = z.object({
  name: z.string().min(2, "Role name must be at least 2 characters").max(50),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).default([]),
});

// POST /api/v1/roles
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("role.manage");
  const body = await req.json();
  const parsed = createRoleSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  const existing = await db.role.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    throw ApiError.duplicate("Role", "name", parsed.data.name);
  }

  // Validate permission IDs
  if (parsed.data.permissionIds.length > 0) {
    const count = await db.permission.count({
      where: { id: { in: parsed.data.permissionIds } },
    });
    if (count !== parsed.data.permissionIds.length) {
      throw ApiError.businessRule("One or more permissions do not exist");
    }
  }

  const role = await db.role.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      isSystem: false,
      permissions: {
        create: parsed.data.permissionIds.map((permissionId) => ({ permissionId })),
      },
    },
    include: {
      permissions: { include: { permission: true } },
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "role.create",
    module: "core",
    resource: "Role",
    resourceId: role.id,
    requestId,
    newValue: { name: role.name, permissionIds: parsed.data.permissionIds },
    message: `Created role ${role.name}`,
  });

  return created(
    {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((rp) => rp.permission.key),
    },
    requestId
  );
});
