// =====================================================================
// NOTIFICATION TEMPLATES API — list + create + send test
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";
import { extractVariables, listChannelAdapters } from "@/core/communication/adapters";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.template.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const channel = url.searchParams.get("channel");

  const where = {
    tenantId: ctx.tenantId,
    ...(channel && channel !== "all" ? { channel } : {}),
    ...(search ? { name: { contains: search } } : {}),
  };

  const [templates, total] = await Promise.all([
    db.notificationTemplate.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.notificationTemplate.count({ where }),
  ]);

  // Also return adapter catalog
  const adapters = listChannelAdapters();

  return paginated(
    templates.map((t) => ({
      ...t, variables: t.variables ? JSON.parse(t.variables) : extractVariables(t.body),
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  name: z.string().min(2).max(100),
  channel: z.enum(["email", "sms", "whatsapp", "push"]),
  subject: z.string().max(200).optional().or(z.literal("")),
  body: z.string().min(1, "Body is required").max(5000),
  language: z.string().default("en"),
  status: z.enum(["active", "disabled"]).default("active"),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("communication", "comm.template.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.subject === "") data.subject = null;
  data.variables = JSON.stringify(extractVariables(data.body));

  const existing = await db.notificationTemplate.findUnique({ where: { tenantId_name: { tenantId: ctx.tenantId, name: data.name } } });
  if (existing) throw ApiError.duplicate("Template", "name", data.name);

  const template = await db.notificationTemplate.create({ data: { tenantId: ctx.tenantId, ...data } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "template.create", module: "communication", resource: "NotificationTemplate", resourceId: template.id, requestId, message: `Created template ${template.name} (${template.channel})` });
  return created({ id: template.id, name: template.name, channel: template.channel, status: template.status }, requestId);
});
