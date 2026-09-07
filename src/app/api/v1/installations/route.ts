// =====================================================================
// INSTALLATIONS API — list + create (work orders)
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
  const ctx = await requireModulePermission("operations", "ops.installation.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const technicianId = url.searchParams.get("technicianId");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(type && type !== "all" ? { type } : {}),
    ...(technicianId && technicianId !== "all" ? { technicianId } : {}),
    ...(search ? { OR: [{ workOrderNo: { contains: search } }, { address: { contains: search } }, { subscriber: { customerId: { contains: search } } }, { subscriber: { firstName: { contains: search } } }, { subscriber: { lastName: { contains: search } } }] } : {}),
  };

  const [installations, total] = await Promise.all([
    db.installation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true } },
        technician: { select: { id: true, name: true } },
      },
    }),
    db.installation.count({ where }),
  ]);

  return paginated(
    installations.map((i) => ({
      id: i.id,
      workOrderNo: i.workOrderNo,
      type: i.type,
      status: i.status,
      address: i.address,
      scheduledDate: i.scheduledDate,
      completedAt: i.completedAt,
      notes: i.notes,
      subscriber: i.subscriber ? { customerId: i.subscriber.customerId, name: `${i.subscriber.firstName} ${i.subscriber.lastName}` } : null,
      technician: i.technician ? { id: i.technician.id, name: i.technician.name } : null,
      createdAt: i.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  subscriberId: z.string().optional(),
  technicianId: z.string().optional(),
  type: z.enum(["new_install", "upgrade", "repair", "disconnect", "relocation"]).default("new_install"),
  address: z.string().optional().or(z.literal("")),
  scheduledDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.installation.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data = parsed.data;

  const year = new Date().getFullYear();
  const count = await db.installation.count({ where: { workOrderNo: { startsWith: `WO-${year}-` } } });
  const workOrderNo = `WO-${year}-${String(count + 1).padStart(4, "0")}`;

  const inst = await db.installation.create({
    data: {
      tenantId: ctx.tenantId,
      workOrderNo,
      subscriberId: data.subscriberId || null,
      technicianId: data.technicianId || null,
      type: data.type,
      status: "scheduled",
      address: data.address || null,
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
      notes: data.notes || null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "installation.create",
    module: "operations", resource: "Installation", resourceId: inst.id, requestId,
    message: `Created work order ${workOrderNo} (${data.type})`,
  });

  await eventBus.emit(EVENTS.INSTALLATION_COMPLETED, { installationId: inst.id, workOrderNo }, { tenantId: ctx.tenantId, source: "operations", requestId });

  return created({ id: inst.id, workOrderNo: inst.workOrderNo, status: inst.status }, requestId);
});
