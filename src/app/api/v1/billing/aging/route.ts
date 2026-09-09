// =====================================================================
// AR AGING API — Accounts Receivable aging report
// GET /api/v1/billing/aging   → aging buckets for outstanding invoices
// =====================================================================

import { NextRequest } from "next/server";
import { apiRoute, ok } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { generateArAgingReport } from "@/core/billing/wallet";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  void req;
  const asOf = req.nextUrl.searchParams.get("asOf");
  const report = await generateArAgingReport(
    ctx.tenantId,
    asOf ? new Date(asOf) : undefined
  );
  return ok(report, { requestId }, requestId);
});
