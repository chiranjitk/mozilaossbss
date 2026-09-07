// =====================================================================
// INCIDENTS API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.incident.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const severity = url.searchParams.get("severity");
  const category = url.searchParams.get("category");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(severity && severity !== "all" ? { severity } : {}),
    ...(category && category !== "all" ? { category } : {}),
    ...(search ? { OR: [{ incidentNo: { contains: search } }, { title: { contains: search } }, { description: { contains: search } }] } : {}),
  };

  const [incidents, total] = await Promise.all([
    db.incident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { assignee: { select: { id: true, name: true, username: true } } },
    }),
    db.incident.count({ where }),
  ]);

  return paginated(
    incidents.map((i) => ({
      id: i.id,
      incidentNo: i.incidentNo,
      title: i.title,
      description: i.description,
      severity: i.severity,
      status: i.status,
      category: i.category,
      affectedAreas: i.affectedAreas,
      reportedBy: i.reportedBy,
      assignee: i.assignee ? { id: i.assignee.id, name: i.assignee.name ?? i.assignee.username } : null,
      startedAt: i.startedAt,
      acknowledgedAt: i.acknowledgedAt,
      resolvedAt: i.resolvedAt,
      closedAt: i.closedAt,
      resolution: i.resolution,
      rootCause: i.rootCause,
      duration: i.resolvedAt ? Math.floor((i.resolvedAt.getTime() - i.startedAt.getTime()) / 1000) : Math.floor((Date.now() - i.startedAt.getTime()) / 1000),
      createdAt: i.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  severity: z.enum(["minor", "major", "critical", "catastrophic"]).default("minor"),
  category: z.enum(["network", "system", "security", "power", "other"]).default("network"),
  affectedAreas: z.string().optional().or(z.literal("")),
  reportedBy: z.string().optional(),
  assignedTo: z.string().optional(),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.incident.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data = parsed.data;

  const year = new Date().getFullYear();
  const count = await db.incident.count({ where: { incidentNo: { startsWith: `INC-${year}-` } } });
  const incidentNo = `INC-${year}-${String(count + 1).padStart(4, "0")}`;

  const incident = await db.incident.create({
    data: {
      tenantId: ctx.tenantId,
      incidentNo,
      title: data.title,
      description: data.description || null,
      severity: data.severity,
      status: "open",
      category: data.category,
      affectedAreas: data.affectedAreas || null,
      reportedBy: data.reportedBy || ctx.userId,
      assignedTo: data.assignedTo || null,
      startedAt: new Date(),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "incident.create",
    module: "operations", resource: "Incident", resourceId: incident.id, requestId,
    message: `Created incident ${incidentNo} (${data.severity}): ${data.title}`,
  });

  await eventBus.emit(EVENTS.ALERT_TRIGGERED, { incidentId: incident.id, incidentNo, severity: data.severity, title: data.title }, { tenantId: ctx.tenantId, source: "operations", requestId });

  return created({ id: incident.id, incidentNo, status: incident.status }, requestId);
});
