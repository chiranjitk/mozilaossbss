// =====================================================================
// DASHBOARD API — Real KPIs aggregated from the database
// Returns metrics based on the modules the tenant has enabled.
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok } from "@/core/api/errors";
import { requireAuth } from "@/core/rbac";
import { resolveModuleStates } from "@/core/modules/resolver";
import { logger } from "@/core/logging/logger";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireAuth();
  logger.debug("Dashboard KPI fetch", { requestId, userId: ctx.userId, tenantId: ctx.tenantId });

  const states = await resolveModuleStates(ctx.tenantId);
  const enabledIds = new Set(states.filter((s) => s.enabled).map((s) => s.module.id));

  // Fetch tenant locale/currency for client-side formatting
  const tenantLocale = await db.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { currency: true, locale: true, timezone: true },
  });

  // Run only the queries relevant to enabled modules — disabled modules cost ~0
  const [
    subscriberCount,
    activeSubscriberCount,
    suspendedSubscriberCount,
    activeSessionCount,
    onlineNasCount,
    openComplaintCount,
    openIncidentsPlaceholder,
    pendingInvoices,
    overdueInvoices,
    revenueToday,
    revenueMonth,
    paymentsTodayCount,
    auditRecent,
  ] = await Promise.all([
    // Customer
    enabledIds.has("subscribers")
      ? db.subscriber.count({ where: { tenantId: ctx.tenantId } })
      : Promise.resolve(0),
    enabledIds.has("subscribers")
      ? db.subscriber.count({ where: { tenantId: ctx.tenantId, status: "active" } })
      : Promise.resolve(0),
    enabledIds.has("subscribers")
      ? db.subscriber.count({ where: { tenantId: ctx.tenantId, status: "suspended" } })
      : Promise.resolve(0),
    // AAA
    enabledIds.has("aaa")
      ? db.activeSession.count({ where: { tenantId: ctx.tenantId, status: "active" } })
      : Promise.resolve(0),
    enabledIds.has("aaa")
      ? db.nasClient.count({ where: { tenantId: ctx.tenantId, status: "active" } })
      : Promise.resolve(0),
    // Operations
    enabledIds.has("operations")
      ? db.complaint.count({ where: { tenantId: ctx.tenantId, status: { in: ["open", "in_progress"] } } })
      : Promise.resolve(0),
    Promise.resolve(0), // incidents table not yet in Phase 0
    // Billing
    enabledIds.has("billing")
      ? db.invoice.count({ where: { tenantId: ctx.tenantId, status: { in: ["issued", "partial"] } } })
      : Promise.resolve(0),
    enabledIds.has("billing")
      ? db.invoice.count({ where: { tenantId: ctx.tenantId, status: "overdue" } })
      : Promise.resolve(0),
    enabledIds.has("payments")
      ? db.payment.aggregate({
          _sum: { amount: true },
          where: {
            tenantId: ctx.tenantId,
            status: "completed",
            receivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    enabledIds.has("payments")
      ? db.payment.aggregate({
          _sum: { amount: true },
          where: {
            tenantId: ctx.tenantId,
            status: "completed",
            receivedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    enabledIds.has("payments")
      ? db.payment.count({
          where: {
            tenantId: ctx.tenantId,
            status: "completed",
            receivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        })
      : Promise.resolve(0),
    db.auditLog.count({
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  // Recent activity (last 10 audit events)
  const recentActivity = await db.auditLog.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      action: true,
      module: true,
      resource: true,
      status: true,
      message: true,
      createdAt: true,
      userId: true,
    },
  });

  const todayRevenue = revenueToday._sum.amount?.toNumber() ?? 0;
  const monthRevenue = revenueMonth._sum.amount?.toNumber() ?? 0;

  return ok({
    tenant: {
      id: ctx.tenantId,
      name: ctx.tenantName,
      slug: ctx.tenantSlug,
      currency: tenantLocale?.currency ?? "USD",
      locale: tenantLocale?.locale ?? "en",
      timezone: tenantLocale?.timezone ?? "UTC",
    },
    user: {
      id: ctx.userId,
      roles: ctx.roles,
    },
    modules: states.map((s) => ({
      id: s.module.id,
      name: s.module.name,
      category: s.module.category,
      enabled: s.enabled,
      health: s.health,
      workerStatus: s.workerStatus,
      core: s.module.coreModule,
    })),
    metrics: {
      subscribers: {
        total: subscriberCount,
        active: activeSubscriberCount,
        suspended: suspendedSubscriberCount,
      },
      sessions: {
        active: activeSessionCount,
        capacity: 100000, // production target, not sandbox limit
      },
      network: {
        onlineNas: onlineNasCount,
      },
      billing: {
        pendingInvoices,
        overdueInvoices,
      },
      payments: {
        revenueToday: todayRevenue,
        revenueMonth: monthRevenue,
        paymentsToday: paymentsTodayCount,
      },
      operations: {
        openComplaints: openComplaintCount,
        openIncidents: openIncidentsPlaceholder,
      },
      audit: {
        eventsLast24h: auditRecent,
      },
    },
    recentActivity,
  });
});
