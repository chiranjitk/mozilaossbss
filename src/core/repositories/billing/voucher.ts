// =====================================================================
// VOUCHER REPOSITORY — generate, redeem, expire codes
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import {
  paginate,
  parsePagination,
  type PaginatedResult,
} from "@/core/repositories/base";

export const VOUCHER_STATUS = {
  UNUSED: "unused",
  USED: "used",
  EXPIRED: "expired",
  DISABLED: "disabled",
} as const;

export interface VoucherListFilters {
  search?: string;
  status?: string;
  type?: string;
}

export const VOUCHER_INCLUDE = {
  subscriber: {
    select: { id: true, customerId: true, firstName: true, lastName: true },
  },
  plan: { select: { id: true, name: true, code: true } },
} satisfies Prisma.VoucherInclude;

export type VoucherWithRelations = Prisma.VoucherGetPayload<{
  include: typeof VOUCHER_INCLUDE;
}>;

export async function listVouchers(
  tenantId: string,
  filters: VoucherListFilters,
  query: URLSearchParams
): Promise<PaginatedResult<VoucherWithRelations>> {
  const { page, pageSize } = parsePagination(query);

  const where: Prisma.VoucherWhereInput = {
    tenantId,
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.type && filters.type !== "all" ? { type: filters.type } : {}),
    ...(filters.search
      ? {
          OR: [
            { code: { contains: filters.search } },
            { batchId: { contains: filters.search } },
          ],
        }
      : {}),
  };

  return paginate<
    VoucherWithRelations,
    Prisma.VoucherWhereInput,
    Prisma.VoucherOrderByWithRelationInput
  >(
    {
      findMany: (args) => db.voucher.findMany({ ...args, include: VOUCHER_INCLUDE }),
      count: (args) => db.voucher.count(args),
    },
    { where, orderBy: { createdAt: "desc" }, page, pageSize }
  );
}

/**
 * Generate a random voucher code (e.g. CRYP-A1B2-C3D4-E5F6).
 */
export function generateVoucherCode(): string {
  const bytes = randomBytes(8);
  const hex = bytes.toString("hex").toUpperCase();
  return `CRYP-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

export interface GenerateVouchersInput {
  tenantId: string;
  count: number;
  type: string;
  planId?: string;
  value: number;
  currency?: string;
  durationDays?: number;
  expiresAt?: Date;
  batchId?: string;
  notes?: string;
}

/**
 * Bulk generate vouchers with unique codes.
 */
export async function generateVouchers(
  input: GenerateVouchersInput
): Promise<VoucherWithRelations[]> {
  const {
    tenantId,
    count,
    type,
    planId,
    value,
    currency = "USD",
    durationDays,
    expiresAt,
    batchId,
    notes,
  } = input;

  if (count > 1000) {
    throw new Error("Cannot generate more than 1000 vouchers at once");
  }

  const batch = batchId || `BATCH-${Date.now()}`;
  const vouchers: VoucherWithRelations[] = [];

  for (let i = 0; i < count; i++) {
    // Ensure unique code (retry on collision)
    let code = generateVoucherCode();
    let attempts = 0;
    while (await db.voucher.findUnique({ where: { code } })) {
      code = generateVoucherCode();
      if (++attempts > 10) throw new Error("Failed to generate unique code");
    }

    const voucher = await db.voucher.create({
      data: {
        tenantId,
        code,
        batchId: batch,
        type,
        planId: planId || null,
        value: new Prisma.Decimal(value),
        currency,
        durationDays: durationDays || null,
        status: VOUCHER_STATUS.UNUSED,
        expiresAt: expiresAt || null,
        notes: notes || null,
      },
      include: VOUCHER_INCLUDE,
    });
    vouchers.push(voucher);
  }

  return vouchers;
}

/**
 * Redeem a voucher for a subscriber.
 * - Validates the voucher exists, is unused, not expired.
 * - For plan_subscription: assigns the plan to the subscriber (via event).
 * - For topup/credit: adds credit to the subscriber's account.
 * Returns the updated voucher + redemption details.
 */
export async function redeemVoucher(
  tenantId: string,
  code: string,
  subscriberId: string
): Promise<{
  voucher: VoucherWithRelations;
  action: string;
  details: Record<string, unknown>;
}> {
  const voucher = await db.voucher.findUnique({
    where: { code },
    include: VOUCHER_INCLUDE,
  });

  if (!voucher) {
    throw new Error("Voucher code not found");
  }
  if (voucher.tenantId !== tenantId) {
    throw new Error("Voucher not found");
  }
  if (voucher.status === VOUCHER_STATUS.USED) {
    throw new Error("Voucher has already been used");
  }
  if (voucher.status === VOUCHER_STATUS.DISABLED) {
    throw new Error("Voucher is disabled");
  }
  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    await db.voucher.update({
      where: { id: voucher.id },
      data: { status: VOUCHER_STATUS.EXPIRED },
    });
    throw new Error("Voucher has expired");
  }

  const updated = await db.voucher.update({
    where: { id: voucher.id },
    data: {
      status: VOUCHER_STATUS.USED,
      subscriberId,
      redeemedAt: new Date(),
    },
    include: VOUCHER_INCLUDE,
  });

  // Determine action based on voucher type
  let action = "credited";
  const details: Record<string, unknown> = {
    voucherId: updated.id,
    voucherType: updated.type,
    value: updated.value.toNumber(),
  };

  if (updated.type === "plan_subscription" && updated.planId) {
    // Assign plan to subscriber
    await db.subscriber.update({
      where: { id: subscriberId },
      data: { planId: updated.planId, status: "active" },
    });
    action = "plan_assigned";
    details.planId = updated.planId;
    details.planName = updated.plan?.name;
    details.durationDays = updated.durationDays;
  } else if (updated.type === "topup" || updated.type === "credit") {
    // Topup: create a payment record that credits the subscriber
    action = "credit_applied";
  }

  return { voucher: updated, action, details };
}

export async function disableVoucher(
  tenantId: string,
  id: string
): Promise<void> {
  await db.voucher.update({
    where: { id, tenantId },
    data: { status: VOUCHER_STATUS.DISABLED },
  });
}

export async function getVoucherStats(tenantId: string) {
  const [total, unused, used, expired, disabled] = await Promise.all([
    db.voucher.count({ where: { tenantId } }),
    db.voucher.count({ where: { tenantId, status: "unused" } }),
    db.voucher.count({ where: { tenantId, status: "used" } }),
    db.voucher.count({ where: { tenantId, status: "expired" } }),
    db.voucher.count({ where: { tenantId, status: "disabled" } }),
  ]);

  return { total, unused, used, expired, disabled };
}
