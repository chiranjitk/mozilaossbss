// =====================================================================
// QOS QUEUES API — list + create + CRUD
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";
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

  // === INDUSTRY STANDARD: Sync QoS queue to radgroupreply ===
  const groupName = `qos-${queue.name.toLowerCase().replace(/\s+/g, "-")}`;
  const qosAttrs: Array<{ groupname: string; attribute: string; op: string; value: string }> = [];

  if (queue.rateLimit) {
    qosAttrs.push({ groupname: groupName, attribute: "WISPr-Bandwidth-Max-Down", op: ":=", value: String(queue.rateLimit) });
    qosAttrs.push({ groupname: groupName, attribute: "WISPr-Bandwidth-Max-Up", op: ":=", value: String(Math.round(queue.rateLimit * 0.2)) });
  }
  if (queue.ceilLimit) {
    qosAttrs.push({ groupname: groupName, attribute: "Cryptsk-QoS-Ceil", op: ":=", value: String(queue.ceilLimit) });
  }
  // Priority mapping: P1=high priority, P8=best effort
  const dscpValue = queue.priority <= 2 ? "46" : queue.priority <= 4 ? "34" : queue.priority <= 6 ? "18" : "0";
  qosAttrs.push({ groupname: groupName, attribute: "Cryptsk-QoS-Priority", op: ":=", value: dscpValue });

  if (qosAttrs.length > 0) {
    await db.radGroupReply.createMany({ data: qosAttrs, skipDuplicates: true });
  }

  await eventBus.emit("policy.qos.created", { queueId: queue.id, groupName, priority: queue.priority }, { tenantId: ctx.tenantId, source: "policy", requestId });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "qos.create", module: "policy", resource: "QosQueue", resourceId: queue.id, requestId, message: `Created QoS queue ${queue.name} → synced to RADIUS group ${groupName}` });
  return created({ id: queue.id, name: queue.name, status: queue.status, radiusGroup: groupName }, requestId);
});
