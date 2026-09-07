// =====================================================================
// NAS DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/nas/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const nas = await db.nasClient.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      _count: {
        select: {
          activeSessions: { where: { status: "active" } },
          sessionHistories: true,
        },
      },
    },
  });
  if (!nas) {
    throw ApiError.notFound("NAS", id);
  }

  return ok({
    id: nas.id,
    name: nas.name,
    ipAddress: nas.ipAddress,
    type: nas.type,
    coaPort: nas.coaPort,
    status: nas.status,
    lastSeenAt: nas.lastSeenAt,
    // sharedSecret returned only in detail view (admin has aaa.nas.read)
    sharedSecret: nas.sharedSecret,
    activeSessionCount: nas._count.activeSessions,
    totalSessionCount: nas._count.sessionHistories,
    createdAt: nas.createdAt,
    updatedAt: nas.updatedAt,
  });
});

const updateNasSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  sharedSecret: z.string().min(4).optional(),
  type: z.enum(["mikrotik", "cisco", "juniper", "generic", "other"]).optional(),
  coaPort: z.number().int().min(1).max(65535).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

// PATCH /api/v1/nas/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.nasClient.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("NAS", id);
  }

  const body = await req.json();
  const parsed = updateNasSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  const updated = await db.nasClient.update({
    where: { id },
    data: parsed.data,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "nas.update",
    module: "aaa",
    resource: "NasClient",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, type: existing.type, status: existing.status },
    newValue: parsed.data,
    message: `Updated NAS ${updated.name}`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    ipAddress: updated.ipAddress,
    type: updated.type,
    status: updated.status,
  });
});

// DELETE /api/v1/nas/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.delete");
  const id = new URL(req.url).pathname.split("/")[4];

  const nas = await db.nasClient.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { _count: { select: { activeSessions: { where: { status: "active" } } } } },
  });
  if (!nas) {
    throw ApiError.notFound("NAS", id);
  }
  if (nas._count.activeSessions > 0) {
    throw ApiError.businessRule(
      `Cannot delete NAS with ${nas._count.activeSessions} active session(s). Disconnect them first.`
    );
  }

  await db.nasClient.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "nas.delete",
    module: "aaa",
    resource: "NasClient",
    resourceId: id,
    requestId,
    oldValue: { name: nas.name, ipAddress: nas.ipAddress },
    message: `Deleted NAS ${nas.name}`,
  });

  return ok({ deleted: true, id });
});
