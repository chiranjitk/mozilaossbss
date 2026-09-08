// =====================================================================
// PROMOTIONS API — list, create (discount codes / coupons)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/promotions
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  const now = new Date();
  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(type && type !== "all" ? { type } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } },
            { description: { contains: search } },
          ],
        }
      : {}),
  };

  const [promotions, total] = await Promise.all([
    db.promotion.findMany({
      where,
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.promotion.count({ where }),
  ]);

  return paginated(
    promotions.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      description: p.description,
      type: p.type,
      value: p.value,
      maxUses: p.maxUses,
      usedCount: p.usedCount,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
      status: p.status,
      applicablePlans: p.applicablePlans,
      isExpired: p.validUntil < now,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createPromotionSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  code: z
    .string()
    .min(2, "Code is required")
    .max(60)
    .regex(/^[A-Z0-9_-]+$/i, "Code must be alphanumeric, dash, or underscore"),
  description: z.string().max(1000).optional().or(z.literal("")),
  type: z.enum(["percentage", "flat", "free_trial"]),
  value: z.number().min(0),
  maxUses: z.number().int().min(1).optional().or(z.null()),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  status: z.enum(["active", "expired", "depleted"]).default("active"),
  applicablePlans: z.string().max(2000).optional().or(z.literal("")).or(z.null()),
});

// POST /api/v1/promotions
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const body = await req.json();
  const parsed = createPromotionSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Check code uniqueness
  const existing = await db.promotion.findUnique({ where: { code: data.code } });
  if (existing) {
    throw ApiError.duplicate("Promotion", "code", data.code);
  }

  const promotion = await db.promotion.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      code: data.code.toUpperCase(),
      description: data.description || null,
      type: data.type,
      value: data.value,
      maxUses: data.maxUses ?? null,
      usedCount: 0,
      validFrom: new Date(data.validFrom),
      validUntil: new Date(data.validUntil),
      status: data.status,
      applicablePlans: data.applicablePlans || null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "promotion.create",
    module: "billing",
    resource: "Promotion",
    resourceId: promotion.id,
    requestId,
    newValue: {
      name: promotion.name,
      code: promotion.code,
      type: promotion.type,
      value: promotion.value,
    },
    message: `Created promotion "${promotion.name}" (${promotion.code})`,
  });

  return created(
    {
      id: promotion.id,
      name: promotion.name,
      code: promotion.code,
      status: promotion.status,
    },
    requestId
  );
});
