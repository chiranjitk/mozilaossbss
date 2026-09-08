// =====================================================================
// TEMPLATE DETAIL API — GET, PATCH, DELETE + send test
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { extractVariables, getChannelAdapter, renderTemplate } from "@/core/communication/adapters";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.template.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const t = await db.notificationTemplate.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!t) throw ApiError.notFound("Template", id);
  return ok({ ...t, variables: t.variables ? JSON.parse(t.variables) : extractVariables(t.body) });
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  subject: z.string().max(200).optional().or(z.literal("")),
  body: z.string().min(1).max(5000).optional(),
  language: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.template.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.notificationTemplate.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Template", id);

  const body = await req.json();

  // Handle send test action
  if (body.action === "send_test") {
    const adapter = getChannelAdapter(existing.channel);
    if (!adapter) throw ApiError.businessRule(`Unknown channel: ${existing.channel}`);

    const testVars: Record<string, string> = {};
    const vars = extractVariables(existing.body);
    for (const v of vars) testVars[v] = `[test-${v}]`;

    const rendered = renderTemplate(existing.body, testVars);
    const result = await adapter.send({ to: body.to || "test@example.com", subject: existing.subject ?? "Test", body: rendered }, {});

    // Log the test
    await db.communicationLog.create({
      data: { tenantId: ctx.tenantId, templateId: id, channel: existing.channel, recipient: body.to || "test@example.com", subject: existing.subject, body: rendered, status: result.success ? "sent" : "failed", error: result.error, sentAt: result.success ? new Date() : null },
    });

    return ok({ sent: result.success, messageId: result.messageId, error: result.error });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.subject === "") data.subject = null;
  if (data.body) data.variables = JSON.stringify(extractVariables(data.body));

  const updated = await db.notificationTemplate.update({ where: { id }, data });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "template.update", module: "communication", resource: "NotificationTemplate", resourceId: id, requestId, message: `Updated template ${updated.name}` });
  return ok({ id: updated.id, name: updated.name, status: updated.status });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.template.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.notificationTemplate.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Template", id);
  await db.notificationTemplate.delete({ where: { id } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "template.delete", module: "communication", resource: "NotificationTemplate", resourceId: id, requestId, message: `Deleted template ${existing.name}` });
  return ok({ deleted: true, id });
});
