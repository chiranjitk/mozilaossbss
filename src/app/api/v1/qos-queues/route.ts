// =====================================================================
// QOS QUEUES API — list + create + CRUD
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
  const ctx = await requireModulePermission("policy", "policy.qos.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const where = { tenantId: ctx.tenantId, ...(status && status !== "all" ? { status } : {}), ...(search ? { name: { contains: search } } : {}) };
  const [queues, total] = await Promise.all([
    db.qosQueue.findMany({ where, orderBy: { priority: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.qosQueue.count({ where }),
  ]);
  return paginated(queues, { page, pageSize, total }, requestId);
});

const createSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  type: z.enum(["pfifo", "bfifo", "codel", "fq_codel", "priority"]).default("pfifo"),
  priority: z.number().int().min(1).max(8).default(8),
  rateLimit: z.number().int().optional(),
  ceilLimit: z.number().int().optional(),
  quantum: z.number().int().optional(),
  status: z.enum(["active", "disabled"]).default("active"),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.qos.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.description === "") data.description = null;

  const existing = await db.qosQueue.findUnique({ where: { tenantId_name: { tenantId: ctx.tenantId, name: data.name } } });
  if (existing) throw ApiError.duplicate("Queue", "name", data.name);

  const queue = await db.qosQueue.create({ data: { tenantId: ctx.tenantId, ...data } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "qos.create", module: "policy", resource: "QosQueue", resourceId: queue.id, requestId, message: `Created QoS queue ${queue.name}` });
  return created({ id: queue.id, name: queue.name, status: queue.status }, requestId);
});
