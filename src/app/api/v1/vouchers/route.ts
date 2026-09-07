// =====================================================================
// VOUCHERS API — list, generate, redeem
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import {
  listVouchers,
  generateVouchers,
  redeemVoucher,
  disableVoucher,
  getVoucherStats,
} from "@/core/repositories/billing/voucher";

export const dynamic = "force-dynamic";

// GET /api/v1/vouchers
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.read");
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;

  // If stats requested
  if (url.searchParams.get("stats") === "true") {
    const stats = await getVoucherStats(ctx.tenantId);
    return ok({ stats });
  }

  const result = await listVouchers(
    ctx.tenantId,
    { search, status, type },
    url.searchParams
  );

  return paginated(
    result.data.map((v) => ({
      id: v.id,
      code: v.code,
      batchId: v.batchId,
      type: v.type,
      plan: v.plan ? { id: v.plan.id, name: v.plan.name, code: v.plan.code } : null,
      value: v.value.toNumber(),
      currency: v.currency,
      durationDays: v.durationDays,
      status: v.status,
      subscriber: v.subscriber
        ? {
            customerId: v.subscriber.customerId,
            name: `${v.subscriber.firstName} ${v.subscriber.lastName}`,
          }
        : null,
      redeemedAt: v.redeemedAt,
      expiresAt: v.expiresAt,
      notes: v.notes,
      createdAt: v.createdAt,
    })),
    { page: result.page, pageSize: result.pageSize, total: result.total },
    requestId
  );
});

const generateSchema = z.object({
  count: z.number().int().min(1).max(1000),
  type: z.enum(["plan_subscription", "topup", "discount", "credit"]),
  planId: z.string().optional(),
  value: z.number().min(0),
  currency: z.string().default("USD"),
  durationDays: z.number().int().min(1).max(365).optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

// POST /api/v1/vouchers — generate vouchers OR redeem (if {action: "redeem"})
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.voucher.write");
  const body = await req.json();

  // Redeem action
  if (body.action === "redeem") {
    const redeemSchema = z.object({
      code: z.string().min(1),
      subscriberId: z.string().min(1),
    });
    const parsed = redeemSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.validation(parsed.error);
    }

    try {
      const result = await redeemVoucher(ctx.tenantId, parsed.data.code, parsed.data.subscriberId);

      await recordAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "voucher.redeem",
        module: "billing",
        resource: "Voucher",
        resourceId: result.voucher.id,
        requestId,
        newValue: {
          code: parsed.data.code,
          subscriberId: parsed.data.subscriberId,
          action: result.action,
        },
        message: `Redeemed voucher ${parsed.data.code} (${result.action})`,
      });

      return ok({
        voucherId: result.voucher.id,
        code: result.voucher.code,
        action: result.action,
        details: result.details,
      });
    } catch (err) {
      throw ApiError.businessRule(
        err instanceof Error ? err.message : "Failed to redeem voucher"
      );
    }
  }

  // Generate action (default)
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  const data = parsed.data;
  const vouchers = await generateVouchers({
    tenantId: ctx.tenantId,
    count: data.count,
    type: data.type,
    planId: data.planId,
    value: data.value,
    currency: data.currency,
    durationDays: data.durationDays,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    notes: data.notes,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "voucher.generate",
    module: "billing",
    resource: "Voucher",
    requestId,
    newValue: { count: vouchers.length, type: data.type, batchId: vouchers[0]?.batchId },
    message: `Generated ${vouchers.length} voucher(s) (batch ${vouchers[0]?.batchId})`,
  });

  return created(
    {
      count: vouchers.length,
      batchId: vouchers[0]?.batchId,
      codes: vouchers.map((v) => v.code),
    },
    requestId
  );
});
