// =====================================================================
// QOS QUEUE DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.qos.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const q = await db.qosQueue.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!q) throw ApiError.notFound("Queue", id);
  return ok(q);
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  type: z.enum(["pfifo", "bfifo", "codel", "fq_codel", "priority"]).optional(),
  priority: z.number().int().min(1).max(8).optional(),
  rateLimit: z.number().int().optional(),
  ceilLimit: z.number().int().optional(),
  quantum: z.number().int().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.qos.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.qosQueue.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Queue", id);
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.description === "") data.description = null;
  const updated = await db.qosQueue.update({ where: { id }, data });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "qos.update", module: "policy", resource: "QosQueue", resourceId: id, requestId, message: `Updated QoS queue ${updated.name}` });
  return ok({ id: updated.id, name: updated.name, status: updated.status });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.qos.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.qosQueue.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Queue", id);
  await db.qosQueue.delete({ where: { id } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "qos.delete", module: "policy", resource: "QosQueue", resourceId: id, requestId, message: `Deleted QoS queue ${existing.name}` });
  return ok({ deleted: true, id });
});
