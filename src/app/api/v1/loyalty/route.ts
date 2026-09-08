// =====================================================================
// LOYALTY API — list (members & their tier/points)
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, paginated } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/loyalty
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.complaint.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const tier = url.searchParams.get("tier");

  // LoyaltyMember.subscriberId is globally @unique, so all members belong to a
  // subscriber. We join by fetching subscribers for the tenant.
  const subscribers = await db.subscriber.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, customerId: true, firstName: true, lastName: true },
  });
  const subscriberIds = subscribers.map((s) => s.id);

  const where = {
    tenantId: ctx.tenantId,
    subscriberId: { in: subscriberIds },
    ...(tier && tier !== "all" ? { tier } : {}),
  };

  const [rows, total] = await Promise.all([
    db.loyaltyMember.findMany({
      where,
      orderBy: [{ totalEarned: "desc" }, { points: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.loyaltyMember.count({ where }),
  ]);

  let filtered = rows;
  if (search) {
    const q = search.toLowerCase();
    filtered = rows.filter((r) => {
      const sub = subscribers.find((s) => s.id === r.subscriberId);
      const name = sub ? `${sub.firstName} ${sub.lastName}`.toLowerCase() : "";
      const cid = sub?.customerId?.toLowerCase() ?? "";
      return name.includes(q) || cid.includes(q);
    });
  }

  return paginated(
    filtered.map((r) => ({
      id: r.id,
      subscriberId: r.subscriberId,
      tier: r.tier,
      points: r.points,
      totalEarned: r.totalEarned,
      totalRedeemed: r.totalRedeemed,
      joinedAt: r.joinedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      subscriber: subscribers.find((s) => s.id === r.subscriberId) ?? null,
    })),
    { page, pageSize, total: search ? filtered.length : total },
    requestId
  );
});
