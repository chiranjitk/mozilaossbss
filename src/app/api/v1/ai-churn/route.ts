// =====================================================================
// CHURN PREDICTION API — analyze subscribers for churn risk
// Uses rule-based scoring (can be enhanced with ML later)
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, paginated } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/ai-churn — list churn predictions + run analysis
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("ai", "ai.churn.read");
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // If action=analyze, run churn analysis on all active subscribers
  if (action === "analyze") {
    return runChurnAnalysis(ctx.tenantId, requestId);
  }

  // Otherwise, list existing predictions
  const { page, pageSize } = parsePagination(url.searchParams);
  const riskLevel = url.searchParams.get("riskLevel");

  const where = {
    tenantId: ctx.tenantId,
    ...(riskLevel && riskLevel !== "all" ? { riskLevel } : {}),
  };

  const [predictions, total] = await Promise.all([
    db.churnPrediction.findMany({
      where,
      orderBy: { riskScore: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true, status: true, plan: { select: { name: true } } } },
      },
    }),
    db.churnPrediction.count({ where }),
  ]);

  return paginated(
    predictions.map((p) => ({
      id: p.id,
      subscriberId: p.subscriberId,
      subscriber: p.subscriber
        ? {
            customerId: p.subscriber.customerId,
            name: `${p.subscriber.firstName} ${p.subscriber.lastName}`,
            status: p.subscriber.status,
            planName: p.subscriber.plan?.name ?? null,
          }
        : null,
      riskScore: p.riskScore,
      riskLevel: p.riskLevel,
      factors: p.factors ? JSON.parse(p.factors) : [],
      recommendation: p.recommendation,
      evaluatedAt: p.evaluatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

/**
 * Run churn analysis on all active subscribers.
 * Uses rule-based scoring:
 * - Overdue invoices: +30 points
 * - Partial payments: +15 points
 * - No recent sessions (7+ days): +20 points
 * - Complaints open: +10 points each
 * - Suspended status: +25 points
 * - High bandwidth usage (could indicate dissatisfaction): +5
 * Score capped at 100.
 */
async function runChurnAnalysis(tenantId: string, requestId?: string) {
  const subscribers = await db.subscriber.findMany({
    where: { tenantId, status: { in: ["active", "suspended"] } },
    include: {
      plan: { select: { name: true } },
      invoices: { where: { status: { in: ["overdue", "partial"] } }, select: { status: true, total: true, amountPaid: true, dueDate: true } },
      complaints: { where: { status: { in: ["open", "in_progress"] } }, select: { id: true } },
      activeSessions: { where: { status: "active" }, select: { id: true, startTime: true } },
      sessionHistories: { orderBy: { startTime: "desc" }, take: 1, select: { startTime: true } },
    },
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let analyzed = 0;
  let highRisk = 0;

  for (const sub of subscribers) {
    const factors: string[] = [];
    let score = 0;

    // Overdue invoices
    const overdueInvoices = sub.invoices.filter((i) => i.status === "overdue");
    if (overdueInvoices.length > 0) {
      score += 30;
      factors.push(`${overdueInvoices.length} overdue invoice(s)`);
    }

    // Partial payments
    const partialInvoices = sub.invoices.filter((i) => i.status === "partial");
    if (partialInvoices.length > 0) {
      score += 15;
      factors.push(`${partialInvoices.length} partially paid invoice(s)`);
    }

    // No recent sessions
    const lastSession = sub.sessionHistories[0];
    if (!lastSession || lastSession.startTime < sevenDaysAgo) {
      score += 20;
      factors.push("No session in 7+ days");
    }

    // Open complaints
    if (sub.complaints.length > 0) {
      score += Math.min(20, sub.complaints.length * 10);
      factors.push(`${sub.complaints.length} open complaint(s)`);
    }

    // Suspended status
    if (sub.status === "suspended") {
      score += 25;
      factors.push("Account suspended");
    }

    score = Math.min(100, score);

    let riskLevel: string;
    if (score >= 70) { riskLevel = "critical"; highRisk++; }
    else if (score >= 50) { riskLevel = "high"; highRisk++; }
    else if (score >= 30) riskLevel = "medium";
    else riskLevel = "low";

    // Generate recommendation
    let recommendation = "";
    if (score >= 70) {
      recommendation = "Urgent: Contact subscriber immediately. Offer payment plan or discount to prevent churn.";
    } else if (score >= 50) {
      recommendation = "High risk: Schedule follow-up call. Review plan suitability and service quality.";
    } else if (score >= 30) {
      recommendation = "Monitor: Check for service issues. Proactive outreach recommended.";
    } else {
      recommendation = "Low risk: No action needed. Continue regular service.";
    }

    // Upsert prediction
    await db.churnPrediction.upsert({
      where: { subscriberId: sub.id },
      update: {
        riskScore: score,
        riskLevel,
        factors: JSON.stringify(factors),
        recommendation,
        evaluatedAt: now,
      },
      create: {
        tenantId,
        subscriberId: sub.id,
        riskScore: score,
        riskLevel,
        factors: JSON.stringify(factors),
        recommendation,
      },
    });
    analyzed++;
  }

  return ok({
    analyzed,
    highRisk,
    totalSubscribers: subscribers.length,
    message: `Analyzed ${analyzed} subscribers. ${highRisk} at high/critical risk.`,
  });
}
