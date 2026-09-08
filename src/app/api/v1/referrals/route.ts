// =====================================================================
// REFERRALS API — list, create (referrer → referee rewards)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/referrals
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const rewardType = url.searchParams.get("rewardType");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(rewardType && rewardType !== "all" ? { rewardType } : {}),
    ...(search
      ? {
          OR: [{ code: { contains: search } }],
        }
      : {}),
  };

  const [rows, total, subscribers] = await Promise.all([
    db.referral.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.referral.count({ where }),
    db.subscriber.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, customerId: true, firstName: true, lastName: true },
    }),
  ]);

  return paginated(
    rows.map((r) => ({
      id: r.id,
      referrerId: r.referrerId,
      refereeId: r.refereeId,
      code: r.code,
      rewardType: r.rewardType,
      rewardValue: r.rewardValue,
      status: r.status,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      referrer: subscribers.find((s) => s.id === r.referrerId) ?? null,
      referee: subscribers.find((s) => s.id === r.refereeId) ?? null,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  referrerId: z.string().optional().or(z.literal("")).or(z.null()),
  refereeId: z.string().optional().or(z.literal("")).or(z.null()),
  code: z.string().min(2, "Code is required").max(60),
  rewardType: z.enum(["credit", "discount", "free_month"]).default("credit"),
  rewardValue: z.number().min(0),
  status: z.enum(["pending", "completed", "expired"]).default("pending"),
});

// POST /api/v1/referrals
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Code uniqueness (global)
  const existing = await db.referral.findUnique({ where: { code: data.code } });
  if (existing) {
    throw ApiError.duplicate("Referral", "code", data.code);
  }

  // Validate subscribers if provided
  if (data.referrerId) {
    const ref = await db.subscriber.findFirst({
      where: { id: data.referrerId, tenantId: ctx.tenantId },
      select: { id: true, firstName: true, lastName: true, customerId: true },
    });
    if (!ref) throw ApiError.businessRule("Referrer does not exist");
  }
  if (data.refereeId) {
    const ref = await db.subscriber.findFirst({
      where: { id: data.refereeId, tenantId: ctx.tenantId },
      select: { id: true, firstName: true, lastName: true, customerId: true },
    });
    if (!ref) throw ApiError.businessRule("Referee does not exist");
  }

  const referral = await db.referral.create({
    data: {
      tenantId: ctx.tenantId,
      referrerId: data.referrerId || null,
      refereeId: data.refereeId || null,
      code: data.code,
      rewardType: data.rewardType,
      rewardValue: data.rewardValue,
      status: data.status,
      completedAt: data.status === "completed" ? new Date() : null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "referral.create",
    module: "operations",
    resource: "Referral",
    resourceId: referral.id,
    requestId,
    newValue: {
      code: referral.code,
      rewardType: referral.rewardType,
      rewardValue: referral.rewardValue,
      status: referral.status,
    },
    message: `Created referral code ${referral.code} (${referral.rewardType} = ${referral.rewardValue})`,
  });

  return created(
    {
      id: referral.id,
      code: referral.code,
      rewardType: referral.rewardType,
      rewardValue: referral.rewardValue,
      status: referral.status,
    },
    requestId
  );
});
