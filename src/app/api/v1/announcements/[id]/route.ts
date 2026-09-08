// =====================================================================
// ANNOUNCEMENT DETAIL API — PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(2000).optional(),
  level: z.enum(["info", "success", "warning", "error"]).optional(),
  audience: z.enum(["all", "admins", "technicians", "agents"]).optional(),
  dismissible: z.boolean().optional(),
  activeFrom: z.string().datetime().optional().or(z.literal("")).or(z.null()),
  activeUntil: z.string().datetime().optional().or(z.literal("")).or(z.null()),
});

// PATCH /api/v1/announcements/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.announcement.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Announcement", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const updated = await db.announcement.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.message !== undefined ? { message: data.message } : {}),
      ...(data.level !== undefined ? { level: data.level } : {}),
      ...(data.audience !== undefined ? { audience: data.audience } : {}),
      ...(data.dismissible !== undefined ? { dismissible: data.dismissible } : {}),
      ...(data.activeFrom !== undefined
        ? { activeFrom: data.activeFrom ? new Date(data.activeFrom) : new Date() }
        : {}),
      ...(data.activeUntil !== undefined
        ? { activeUntil: data.activeUntil ? new Date(data.activeUntil) : null }
        : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "announcement.update",
    module: "core",
    resource: "Announcement",
    resourceId: id,
    requestId,
    oldValue: {
      title: existing.title,
      level: existing.level,
      audience: existing.audience,
    },
    newValue: data,
    message: `Updated announcement "${updated.title}"`,
  });

  return ok({
    id: updated.id,
    title: updated.title,
    level: updated.level,
  });
});

// DELETE /api/v1/announcements/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.announcement.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Announcement", id);
  }

  await db.announcement.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "announcement.delete",
    module: "core",
    resource: "Announcement",
    resourceId: id,
    requestId,
    oldValue: { title: existing.title },
    message: `Deleted announcement "${existing.title}"`,
  });

  return ok({ deleted: true, id });
});
