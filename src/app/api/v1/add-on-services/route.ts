// =====================================================================
// ADD-ON SERVICES API — list, create (flat / per_day / per_gb / per_month)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/add-on-services
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const chargeType = url.searchParams.get("chargeType");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(chargeType && chargeType !== "all" ? { chargeType } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
          ],
        }
      : {}),
  };

  const [services, total] = await Promise.all([
    db.addOnService.findMany({
      where,
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.addOnService.count({ where }),
  ]);

  return paginated(
    services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      chargeType: s.chargeType,
      price: s.price,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  description: z.string().max(1000).optional().or(z.literal("")),
  chargeType: z.enum(["flat", "per_day", "per_gb", "per_month"]).default("flat"),
  price: z.number().min(0),
  status: z.enum(["active", "disabled"]).default("active"),
});

// POST /api/v1/add-on-services
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Name uniqueness per tenant
  const existing = await db.addOnService.findFirst({
    where: { tenantId: ctx.tenantId, name: data.name },
  });
  if (existing) {
    throw ApiError.duplicate("Add-on service", "name", data.name);
  }

  const svc = await db.addOnService.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      description: data.description || null,
      chargeType: data.chargeType,
      price: data.price,
      status: data.status,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "addon_service.create",
    module: "billing",
    resource: "AddOnService",
    resourceId: svc.id,
    requestId,
    newValue: {
      name: svc.name,
      chargeType: svc.chargeType,
      price: svc.price,
    },
    message: `Created add-on service "${svc.name}"`,
  });

  return created(
    {
      id: svc.id,
      name: svc.name,
      chargeType: svc.chargeType,
      price: svc.price,
      status: svc.status,
    },
    requestId
  );
});
