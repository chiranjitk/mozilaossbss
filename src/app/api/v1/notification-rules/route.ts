// =====================================================================
// NOTIFICATION RULES API — list + create (event→template mapping)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.rule.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const enabled = url.searchParams.get("enabled");

  const where = {
    tenantId: ctx.tenantId,
    ...(enabled === "true" ? { enabled: true } : enabled === "false" ? { enabled: false } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { event: { contains: search } }] } : {}),
  };

  const [rules, total] = await Promise.all([
    db.notificationRule.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { template: { select: { id: true, name: true, channel: true } } } }),
    db.notificationRule.count({ where }),
  ]);

  return paginated(rules.map((r) => ({
    id: r.id, name: r.name, event: r.event, templateId: r.templateId,
    template: r.template ? { name: r.template.name, channel: r.template.channel } : null,
    channel: r.channel, recipient: r.recipient, customRecipient: r.customRecipient,
    enabled: r.enabled, delayMinutes: r.delayMinutes, createdAt: r.createdAt,
  })), { page, pageSize, total }, requestId);
});

const createSchema = z.object({
  name: z.string().min(2).max(100),
  event: z.string().min(1),
  templateId: z.string().min(1),
  channel: z.enum(["email", "sms", "whatsapp", "push"]),
  recipient: z.enum(["subscriber", "admin", "custom"]).default("subscriber"),
  customRecipient: z.string().optional().or(z.literal("")),
  enabled: z.boolean().default(true),
  delayMinutes: z.number().int().min(0).default(0),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.rule.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.customRecipient === "") data.customRecipient = null;

  // Validate template exists and belongs to tenant
  const template = await db.notificationTemplate.findFirst({ where: { id: data.templateId, tenantId: ctx.tenantId } });
  if (!template) throw ApiError.businessRule("Template not found");

  const rule = await db.notificationRule.create({ data: { tenantId: ctx.tenantId, ...data } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "rule.create", module: "communication", resource: "NotificationRule", resourceId: rule.id, requestId, message: `Created rule ${rule.name} (${rule.event} → ${template.name})` });
  return created({ id: rule.id, name: rule.name, event: rule.event, enabled: rule.enabled }, requestId);
});
