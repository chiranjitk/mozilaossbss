// =====================================================================
// NOTIFICATION RULE DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.rule.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const r = await db.notificationRule.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { template: { select: { name: true, channel: true } } } });
  if (!r) throw ApiError.notFound("Rule", id);
  return ok(r);
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  event: z.string().optional(),
  templateId: z.string().optional(),
  channel: z.enum(["email", "sms", "whatsapp", "push"]).optional(),
  recipient: z.enum(["subscriber", "admin", "custom"]).optional(),
  customRecipient: z.string().optional().or(z.literal("")),
  enabled: z.boolean().optional(),
  delayMinutes: z.number().int().min(0).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.rule.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.notificationRule.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Rule", id);
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.customRecipient === "") data.customRecipient = null;
  const updated = await db.notificationRule.update({ where: { id }, data });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "rule.update", module: "communication", resource: "NotificationRule", resourceId: id, requestId, message: `Updated rule ${updated.name}` });
  return ok({ id: updated.id, name: updated.name, enabled: updated.enabled });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.rule.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.notificationRule.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Rule", id);
  await db.notificationRule.delete({ where: { id } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "rule.delete", module: "communication", resource: "NotificationRule", resourceId: id, requestId, message: `Deleted rule ${existing.name}` });
  return ok({ deleted: true, id });
});
