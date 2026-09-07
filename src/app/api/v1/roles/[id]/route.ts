// =====================================================================
// ROLE DETAIL API — PATCH (update permissions) + DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requirePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

const updateRoleSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional(),
});

// PATCH /api/v1/roles/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("role.manage");
  const id = new URL(req.url).pathname.split("/").pop()!;

  const role = await db.role.findUnique({
    where: { id },
    include: { permissions: true },
  });
  if (!role) {
    throw ApiError.notFound("Role", id);
  }

  const body = await req.json();
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  // System roles: only description can change, not name or permissions
  if (role.isSystem) {
    if (parsed.data.name && parsed.data.name !== role.name) {
      throw ApiError.businessRule("System role name cannot be changed");
    }
    if (parsed.data.permissionIds) {
      throw ApiError.businessRule("System role permissions cannot be changed");
    }
  }

  const { permissionIds, ...data } = parsed.data;

  // Validate permission IDs
  if (permissionIds && permissionIds.length > 0) {
    const count = await db.permission.count({
      where: { id: { in: permissionIds } },
    });
    if (count !== permissionIds.length) {
      throw ApiError.businessRule("One or more permissions do not exist");
    }
  }

  const updated = await db.role.update({
    where: { id },
    data: {
      ...(data as any),
      ...(permissionIds
        ? {
            permissions: {
              deleteMany: {},
              create: permissionIds.map((permissionId) => ({ permissionId })),
            },
          }
        : {}),
    },
    include: { permissions: { include: { permission: true } } },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "role.update",
    module: "core",
    resource: "Role",
    resourceId: id,
    requestId,
    oldValue: {
      name: role.name,
      permissionIds: role.permissions.map((rp) => rp.permissionId),
    },
    newValue: parsed.data,
    message: `Updated role ${updated.name}`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    isSystem: updated.isSystem,
    permissions: updated.permissions.map((rp) => rp.permission.key),
  });
});

// DELETE /api/v1/roles/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("role.manage");
  const id = new URL(req.url).pathname.split("/").pop()!;

  const role = await db.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) {
    throw ApiError.notFound("Role", id);
  }
  if (role.isSystem) {
    throw ApiError.businessRule("System roles cannot be deleted");
  }
  if (role._count.users > 0) {
    throw ApiError.businessRule(
      `Cannot delete role with ${role._count.users} assigned user(s). Reassign users first.`
    );
  }

  await db.role.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "role.delete",
    module: "core",
    resource: "Role",
    resourceId: id,
    requestId,
    oldValue: { name: role.name },
    message: `Deleted role ${role.name}`,
  });

  return ok({ deleted: true, id });
});
