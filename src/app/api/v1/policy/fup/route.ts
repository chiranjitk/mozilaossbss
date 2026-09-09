// =====================================================================
// FUP (FAIR USAGE POLICY) CHECK API
// GET /api/v1/policy/fup?subscriberId=...     → FUP status for a subscriber
// GET /api/v1/policy/fup                        → all subscribers with FUP breaches
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { evaluateSubscriberPolicy } from "@/core/policy/engine";

export const dynamic = "force-dynamic";

// GET — FUP status for one subscriber, or all capped subscribers currently throttled
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.read");
  const subscriberId = req.nextUrl.searchParams.get("subscriberId");

  if (subscriberId) {
    const policy = await evaluateSubscriberPolicy(ctx.tenantId, subscriberId);
    return ok(
      {
        subscriberId: policy.subscriberId,
        customerId: policy.customerId,
        username: policy.username,
        planName: policy.planName,
        fup: policy.fup,
        enforcement: policy.enforcement,
        rateLimit: policy.rateLimit,
      },
      { requestId },
      requestId
    );
  }

  // No subscriberId → return all subscribers on capped plans with their utilization
  const cappedSubs = await db.subscriber.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "active",
      plan: { dataCap: { gt: 0 } },
    },
    select: { id: true, customerId: true, firstName: true, lastName: true, username: true, planId: true, plan: { select: { name: true, dataCap: true } } },
  });

  const rows: any[] = [];
  for (const s of cappedSubs) {
    try {
      const policy = await evaluateSubscriberPolicy(ctx.tenantId, s.id);
      rows.push({
        subscriberId: s.id,
        customerId: s.customerId,
        name: `${s.firstName} ${s.lastName}`,
        username: s.username,
        planName: s.plan?.name ?? null,
        capMb: policy.fup.capMb,
        usedMb: policy.fup.usedMb,
        utilizationPct: Math.round(policy.fup.utilizationPct),
        throttled: policy.fup.throttled,
        resetAt: policy.fup.resetAt,
      });
    } catch {
      // skip
    }
  }

  // Sort: throttled first, then by utilization descending
  rows.sort((a, b) => {
    if (a.throttled !== b.throttled) return a.throttled ? -1 : 1;
    return b.utilizationPct - a.utilizationPct;
  });

  return ok(
    {
      total: rows.length,
      throttled: rows.filter((r) => r.throttled).length,
      approaching: rows.filter((r) => !r.throttled && r.utilizationPct >= 80).length,
      subscribers: rows,
    },
    { requestId },
    requestId
  );
});
