// =====================================================================
// LOYALTY DETAIL API — GET, PATCH (tier / points adjustments)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/loyalty/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const member = await db.loyaltyMember.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!member) {
    throw ApiError.notFound("LoyaltyMember", id);
  }

  const subscriber = await db.subscriber.findFirst({
    where: { id: member.subscriberId, tenantId: ctx.tenantId },
    select: { id: true, customerId: true, firstName: true, lastName: true, email: true, phone: true },
  });

  return ok({
    id: member.id,
    subscriberId: member.subscriberId,
    tier: member.tier,
    points: member.points,
    totalEarned: member.totalEarned,
    totalRedeemed: member.totalRedeemed,
    joinedAt: member.joinedAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    subscriber,
  });
});

const updateSchema = z.object({
  tier: z.enum(["bronze", "silver", "gold", "platinum"]).optional(),
  points: z.number().int().min(0).optional(),
  totalEarned: z.number().int().min(0).optional(),
  totalRedeemed: z.number().int().min(0).optional(),
});

// PATCH /api/v1/loyalty/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.loyaltyMember.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("LoyaltyMember", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // If points increased, also bump totalEarned by the delta
  let newTotalEarned = existing.totalEarned;
  if (data.points !== undefined && data.points > existing.points) {
    newTotalEarned = existing.totalEarned + (data.points - existing.points);
  }
  if (data.totalEarned !== undefined) {
    newTotalEarned = data.totalEarned;
  }

  const updated = await db.loyaltyMember.update({
    where: { id },
    data: {
      ...(data.tier !== undefined ? { tier: data.tier } : {}),
      ...(data.points !== undefined ? { points: data.points } : {}),
      ...(data.totalRedeemed !== undefined ? { totalRedeemed: data.totalRedeemed } : {}),
      totalEarned: newTotalEarned,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "loyalty_member.update",
    module: "operations",
    resource: "LoyaltyMember",
    resourceId: id,
    requestId,
    oldValue: {
      tier: existing.tier,
      points: existing.points,
      totalEarned: existing.totalEarned,
      totalRedeemed: existing.totalRedeemed,
    },
    newValue: data,
    message: `Updated loyalty member ${id} (tier=${updated.tier}, points=${updated.points})`,
  });

  return ok({
    id: updated.id,
    tier: updated.tier,
    points: updated.points,
    totalEarned: updated.totalEarned,
    totalRedeemed: updated.totalRedeemed,
  });
});
