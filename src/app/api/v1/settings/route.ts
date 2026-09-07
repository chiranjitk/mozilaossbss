// =====================================================================
// SYSTEM SETTINGS API — key/value config store, tenant-scoped
// GET: list settings (optionally by category)
// PUT: upsert a setting value
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok } from "@/core/api/errors";
import { requirePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";

export const dynamic = "force-dynamic";

// GET /api/v1/settings
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("system.settings.read");
  const category = new URL(req.url).searchParams.get("category");

  const settings = await db.systemSetting.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(category && category !== "all" ? { category } : {}),
    },
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });

  // Group by category
  const byCategory = settings.reduce<Record<string, typeof settings>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return ok({
    settings: Object.entries(byCategory).map(([cat, items]) => ({
      category: cat,
      items: items.map((s) => ({
        id: s.id,
        key: s.key,
        value: s.value,
        encrypted: s.encrypted,
        updatedAt: s.updatedAt,
        updatedBy: s.updatedBy,
      })),
    })),
  });
});

const upsertSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  category: z.string().default("general"),
  encrypted: z.boolean().default(false),
});

// PUT /api/v1/settings
export const PUT = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requirePermission("system.settings.update");
  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("Invalid settings payload");
  }

  const existing = await db.systemSetting.findFirst({
    where: { tenantId: ctx.tenantId, key: parsed.data.key },
  });

  const updated = await db.systemSetting.upsert({
    where: {
      tenantId_key: { tenantId: ctx.tenantId, key: parsed.data.key },
    },
    update: {
      value: parsed.data.value,
      category: parsed.data.category,
      encrypted: parsed.data.encrypted,
      updatedBy: ctx.userId,
    },
    create: {
      tenantId: ctx.tenantId,
      key: parsed.data.key,
      value: parsed.data.value,
      category: parsed.data.category,
      encrypted: parsed.data.encrypted,
      updatedBy: ctx.userId,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "setting.update",
    module: "core",
    resource: "SystemSetting",
    resourceId: updated.id,
    requestId,
    oldValue: existing ? { value: existing.value } : undefined,
    newValue: { key: parsed.data.key, value: parsed.data.encrypted ? "[REDACTED]" : parsed.data.value },
    message: `Updated setting ${parsed.data.key}`,
  });

  await eventBus.emit(
    EVENTS.SETTING_CHANGED,
    { key: parsed.data.key, category: parsed.data.category },
    { tenantId: ctx.tenantId, source: "core.settings", requestId }
  );

  return ok({
    id: updated.id,
    key: updated.key,
    value: updated.value,
    category: updated.category,
    encrypted: updated.encrypted,
    updatedAt: updated.updatedAt,
  });
});
