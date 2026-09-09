// =====================================================================
// PREPAID WALLET API
// GET  /api/v1/billing/prepaid?subscriberId=...                 → wallet state
// POST /api/v1/billing/prepaid                                  → top-up / debit
// POST /api/v1/billing/prepaid/process                          → bulk deductions
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import {
  getWallet,
  topUpWallet,
  debitWallet,
  processPrepaidDeductions,
} from "@/core/billing/wallet";

export const dynamic = "force-dynamic";

// GET — read a subscriber's prepaid wallet
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const subscriberId = req.nextUrl.searchParams.get("subscriberId");
  if (!subscriberId) throw ApiError.validation("subscriberId query param required");
  const wallet = await getWallet(ctx.tenantId, subscriberId);
  return ok(wallet, { requestId }, requestId);
});

const actionSchema = z.object({
  subscriberId: z.string().min(1),
  action: z.enum(["topup", "debit"]),
  amount: z.number().min(0.01),
  method: z.string().default("manual"), // for topup
  description: z.string().optional(), // for debit
  autoRecharge: z.boolean().optional(),
});

// POST — top-up or debit a prepaid wallet
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.create");
  const body = await req.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  let result;
  if (parsed.data.action === "topup") {
    result = await topUpWallet(
      ctx.tenantId,
      parsed.data.subscriberId,
      parsed.data.amount,
      parsed.data.method,
      ctx.userId,
      { autoRecharge: parsed.data.autoRecharge }
    );
    await recordAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "billing.wallet_topup",
      module: "billing",
      resource: "Subscriber",
      resourceId: parsed.data.subscriberId,
      requestId,
      newValue: { amount: parsed.data.amount, method: parsed.data.method, balance: result.balance },
      message: `Prepaid wallet topped up ${parsed.data.amount} via ${parsed.data.method}. New balance: ${result.balance}`,
    });
  } else {
    result = await debitWallet(
      ctx.tenantId,
      parsed.data.subscriberId,
      parsed.data.amount,
      parsed.data.description ?? "Manual debit",
      ctx.userId
    );
    await recordAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "billing.wallet_debit",
      module: "billing",
      resource: "Subscriber",
      resourceId: parsed.data.subscriberId,
      requestId,
      newValue: result,
      message: `Prepaid wallet debited ${parsed.data.amount}. New balance: ${result.newBalance}. Suspended: ${result.suspended}`,
    });
  }

  return ok(result, { requestId }, requestId);
});

// PUT — bulk-process prepaid deductions (nightly billing entrypoint)
export const PUT = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.run");
  void req;
  const result = await processPrepaidDeductions(ctx.tenantId, ctx.userId);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "billing.prepaid_run",
    module: "billing",
    resource: "Subscriber",
    requestId,
    newValue: result,
    message: `Prepaid deduction run: ${result.processed} processed, ${result.debited} debited, ${result.suspended} auto-suspended. ${result.errors.length} errors.`,
  });

  return ok(result, { requestId }, requestId);
});
