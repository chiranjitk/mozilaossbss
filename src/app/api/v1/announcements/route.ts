// =====================================================================
// ANNOUNCEMENTS API — list, create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/announcements
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const level = url.searchParams.get("level");
  const audience = url.searchParams.get("audience");

  const where = {
    tenantId: ctx.tenantId,
    ...(level && level !== "all" ? { level } : {}),
    ...(audience && audience !== "all" ? { audience } : {}),
    ...(search
      ? {
          OR: [{ title: { contains: search } }, { message: { contains: search } }],
        }
      : {}),
  };

  const [announcements, total] = await Promise.all([
    db.announcement.findMany({
      where,
      orderBy: [{ activeFrom: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.announcement.count({ where }),
  ]);

  return paginated(
    announcements.map((a) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      level: a.level,
      audience: a.audience,
      dismissible: a.dismissible,
      activeFrom: a.activeFrom,
      activeUntil: a.activeUntil,
      createdAt: a.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  message: z.string().min(1, "Message is required").max(2000),
  level: z.enum(["info", "success", "warning", "error"]).default("info"),
  audience: z
    .enum(["all", "admins", "technicians", "agents"])
    .default("all"),
  dismissible: z.boolean().default(true),
  activeFrom: z.string().datetime().optional().or(z.literal("")).or(z.null()),
  activeUntil: z.string().datetime().optional().or(z.literal("")).or(z.null()),
});

// POST /api/v1/announcements
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.update");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const announcement = await db.announcement.create({
    data: {
      tenantId: ctx.tenantId,
      title: data.title,
      message: data.message,
      level: data.level,
      audience: data.audience,
      dismissible: data.dismissible,
      activeFrom: data.activeFrom ? new Date(data.activeFrom) : new Date(),
      activeUntil: data.activeUntil ? new Date(data.activeUntil) : null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "announcement.create",
    module: "core",
    resource: "Announcement",
    resourceId: announcement.id,
    requestId,
    newValue: {
      title: announcement.title,
      level: announcement.level,
      audience: announcement.audience,
    },
    message: `Created announcement "${announcement.title}"`,
  });

  return created(
    {
      id: announcement.id,
      title: announcement.title,
      level: announcement.level,
    },
    requestId
  );
});
