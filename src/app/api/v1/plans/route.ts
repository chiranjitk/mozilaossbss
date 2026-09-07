// =====================================================================
// PLANS API — list, create, update, delete
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

// GET /api/v1/plans
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
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

  // If no pagination requested, return all (for dropdowns)
  if (!url.searchParams.has("page")) {
    const plans = await db.plan.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { subscribers: true } } },
    });
    return ok({
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        description: p.description,
        price: p.price.toNumber(),
        currency: p.currency,
        billingCycle: p.billingCycle,
        downloadSpeed: p.downloadSpeed,
        uploadSpeed: p.uploadSpeed,
        dataCap: p.dataCap,
        sessionLimit: p.sessionLimit,
        taxRate: p.taxRate.toNumber(),
        status: p.status,
        subscriberCount: p._count.subscribers,
      })),
    });
  }

  const [plans, total] = await Promise.all([
    db.plan.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { subscribers: true } } },
    }),
    db.plan.count({ where }),
  ]);

  return paginated(
    plans.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      description: p.description,
      price: p.price.toNumber(),
      currency: p.currency,
      billingCycle: p.billingCycle,
      downloadSpeed: p.downloadSpeed,
      uploadSpeed: p.uploadSpeed,
      dataCap: p.dataCap,
      sessionLimit: p.sessionLimit,
      taxRate: p.taxRate.toNumber(),
      status: p.status,
      subscriberCount: p._count.subscribers,
      createdAt: p.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createPlanSchema = z.object({
  name: z.string().min(1, "Plan name is required").max(100),
  code: z.string().min(2, "Plan code is required").max(50).regex(/^[A-Z0-9\-_]+$/, "Code must be uppercase alphanumeric"),
  description: z.string().max(500).optional(),
  price: z.number().min(0, "Price must be ≥ 0"),
  currency: z.string().default("USD"),
  billingCycle: z.enum(["monthly", "quarterly", "yearly", "one_time", "weekly"]).default("monthly"),
  downloadSpeed: z.number().int().min(0).nullable().optional(), // kbps
  uploadSpeed: z.number().int().min(0).nullable().optional(), // kbps
  dataCap: z.number().int().min(0).nullable().optional(), // MB, null = unlimited
  sessionLimit: z.number().int().min(1).default(1),
  taxRate: z.number().min(0).max(1).default(0),
  status: z.enum(["active", "disabled"]).default("active"),
});

// POST /api/v1/plans
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("subscribers", "subscriber.create");
  const body = await req.json();
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const existing = await db.plan.findUnique({ where: { code: data.code } });
  if (existing) {
    throw ApiError.duplicate("Plan", "code", data.code);
  }

  const plan = await db.plan.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      code: data.code,
      description: data.description,
      price: data.price,
      currency: data.currency,
      billingCycle: data.billingCycle,
      downloadSpeed: data.downloadSpeed,
      uploadSpeed: data.uploadSpeed,
      dataCap: data.dataCap,
      sessionLimit: data.sessionLimit,
      taxRate: data.taxRate,
      status: data.status,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "plan.create",
    module: "subscribers",
    resource: "Plan",
    resourceId: plan.id,
    requestId,
    newValue: data,
    message: `Created plan ${plan.name} (${plan.code})`,
  });

  await eventBus.emit(
    EVENTS.PLAN_CREATED,
    { planId: plan.id, code: plan.code, name: plan.name, price: plan.price.toNumber() },
    { tenantId: ctx.tenantId, source: "subscribers", requestId }
  );

  return created(
    {
      id: plan.id,
      name: plan.name,
      code: plan.code,
      price: plan.price.toNumber(),
      status: plan.status,
    },
    requestId
  );
});
