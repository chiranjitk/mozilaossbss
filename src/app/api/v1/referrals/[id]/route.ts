// =====================================================================
// REFERRAL DETAIL API — PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  referrerId: z.string().optional().or(z.literal("")).or(z.null()),
  refereeId: z.string().optional().or(z.literal("")).or(z.null()),
  code: z.string().min(2).max(60).optional(),
  rewardType: z.enum(["credit", "discount", "free_month"]).optional(),
  rewardValue: z.number().min(0).optional(),
  status: z.enum(["pending", "completed", "expired"]).optional(),
});

// PATCH /api/v1/referrals/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.referral.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Referral", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Code uniqueness on change
  if (data.code && data.code !== existing.code) {
    const conflict = await db.referral.findUnique({ where: { code: data.code } });
    if (conflict && conflict.id !== id) {
      throw ApiError.duplicate("Referral", "code", data.code);
    }
  }

  // If status is being moved to completed, set completedAt
  const willComplete = data.status === "completed" && existing.status !== "completed";

  const updated = await db.referral.update({
    where: { id },
    data: {
      ...(data.referrerId !== undefined ? { referrerId: data.referrerId || null } : {}),
      ...(data.refereeId !== undefined ? { refereeId: data.refereeId || null } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.rewardType !== undefined ? { rewardType: data.rewardType } : {}),
      ...(data.rewardValue !== undefined ? { rewardValue: data.rewardValue } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(willComplete ? { completedAt: new Date() } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "referral.update",
    module: "operations",
    resource: "Referral",
    resourceId: id,
    requestId,
    oldValue: {
      code: existing.code,
      status: existing.status,
      rewardType: existing.rewardType,
      rewardValue: existing.rewardValue,
    },
    newValue: data,
    message: `Updated referral ${updated.code} (status → ${updated.status})`,
  });

  return ok({
    id: updated.id,
    code: updated.code,
    status: updated.status,
    rewardType: updated.rewardType,
    rewardValue: updated.rewardValue,
  });
});

// DELETE /api/v1/referrals/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.referral.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Referral", id);
  }

  await db.referral.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "referral.delete",
    module: "operations",
    resource: "Referral",
    resourceId: id,
    requestId,
    oldValue: { code: existing.code, status: existing.status },
    message: `Deleted referral ${existing.code}`,
  });

  return ok({ deleted: true, id });
});
