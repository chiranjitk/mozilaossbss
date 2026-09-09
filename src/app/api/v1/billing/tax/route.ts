// =====================================================================
// TAX ENGINE API
// GET  /api/v1/billing/tax                        → current tax settings
// POST /api/v1/billing/tax                        → update tax settings
// POST /api/v1/billing/tax/calculate              → compute tax for an amount
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import {
  computeTax,
  setTaxSettings,
  type TaxJurisdiction,
} from "@/core/billing/tax";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — current tax configuration for the tenant
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  void req;
  const rows = await db.systemSetting.findMany({
    where: {
      tenantId: ctx.tenantId,
      key: { in: ["tax.jurisdiction", "tax.ratePct", "tax.tenantState"] },
    },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return ok(
    {
      jurisdiction: (map.get("tax.jurisdiction") as TaxJurisdiction) ?? "none",
      ratePct: Number(map.get("tax.ratePct") ?? 0),
      tenantState: map.get("tax.tenantState") ?? null,
    },
    { requestId },
    requestId
  );
});

const updateSchema = z.object({
  jurisdiction: z.enum(["none", "in_gst", "eu_vat", "us_sales", "uk_vat"]).optional(),
  ratePct: z.number().min(0).max(100).optional(),
  tenantState: z.string().max(20).optional(),
});

// POST — update tax configuration
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  await setTaxSettings(ctx.tenantId, parsed.data);

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "billing.tax_settings",
    module: "billing",
    resource: "SystemSetting",
    requestId,
    newValue: parsed.data,
    message: `Tax settings updated: ${JSON.stringify(parsed.data)}`,
  });

  return ok({ updated: parsed.data }, { requestId }, requestId);
});

const calcSchema = z.object({
  baseAmount: z.number().min(0),
  currency: z.string().optional(),
  subscriberId: z.string().optional(),
  placeOfSupplyState: z.string().optional(),
});

// PUT — compute tax for a given amount (preview)
export const PUT = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const body = await req.json();
  const parsed = calcSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);

  const result = await computeTax(ctx.tenantId, {
    baseAmount: parsed.data.baseAmount,
    currency: parsed.data.currency,
    subscriberId: parsed.data.subscriberId,
    placeOfSupplyState: parsed.data.placeOfSupplyState,
  });

  return ok(result, { requestId }, requestId);
});
