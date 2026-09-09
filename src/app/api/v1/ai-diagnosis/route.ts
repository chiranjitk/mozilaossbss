// =====================================================================
// AI DIAGNOSIS API — analyze network health using LLM
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/ai-diagnosis — get current network health summary
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("ai", "ai.diagnosis.use");

  // Gather system health data
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    activeSessions,
    totalSubscribers,
    activeSubscribers,
    suspendedSubscribers,
    overdueInvoices,
    openComplaints,
    openIncidents,
    activeAlerts,
    onlineNas,
    totalNas,
    recentSyslogErrors,
    recentPayments,
  ] = await Promise.all([
    db.activeSession.count({ where: { tenantId: ctx.tenantId, status: "active" } }),
    db.subscriber.count({ where: { tenantId: ctx.tenantId } }),
    db.subscriber.count({ where: { tenantId: ctx.tenantId, status: "active" } }),
    db.subscriber.count({ where: { tenantId: ctx.tenantId, status: "suspended" } }),
    db.invoice.count({ where: { tenantId: ctx.tenantId, status: "overdue" } }),
    db.complaint.count({ where: { tenantId: ctx.tenantId, status: { in: ["open", "in_progress"] } } }),
    db.incident.count({ where: { tenantId: ctx.tenantId, status: { in: ["open", "acknowledged"] } } }),
    db.alert.count({ where: { tenantId: ctx.tenantId, status: "active" } }),
    db.nasClient.count({ where: { tenantId: ctx.tenantId, status: "active" } }),
    db.nasClient.count({ where: { tenantId: ctx.tenantId } }),
    db.syslogEntry.count({ where: { tenantId: ctx.tenantId, severity: { in: ["error", "critical", "emergency"] }, receivedAt: { gte: last24h } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { tenantId: ctx.tenantId, status: "completed", receivedAt: { gte: last24h } } }),
  ]);

  const healthData = {
    timestamp: now.toISOString(),
    activeSessions,
    totalSubscribers,
    activeSubscribers,
    suspendedSubscribers,
    overdueInvoices,
    openComplaints,
    openIncidents,
    activeAlerts,
    onlineNas,
    totalNas,
    recentSyslogErrors,
    revenue24h: recentPayments._sum.amount?.toNumber() ?? 0,
    // Backwards-compat nested view (kept for any external consumers)
    sessions: { active: activeSessions, capacity: 100000 },
    subscribers: { total: totalSubscribers, active: activeSubscribers, suspended: suspendedSubscribers },
    billing: { overdueInvoices, revenue24h: recentPayments._sum.amount?.toNumber() ?? 0 },
    operations: { openComplaints, openIncidents, activeAlerts },
    network: { onlineNas, totalNas, syslogErrors24h: recentSyslogErrors },
  };

  // Determine overall health status
  let healthStatus = "healthy";
  const issues: string[] = [];
  if (activeAlerts > 0) { healthStatus = "warning"; issues.push(`${activeAlerts} active alert(s)`); }
  if (openIncidents > 0) { healthStatus = "warning"; issues.push(`${openIncidents} open incident(s)`); }
  if (overdueInvoices > 5) { healthStatus = "warning"; issues.push(`${overdueInvoices} overdue invoices`); }
  if (recentSyslogErrors > 10) { healthStatus = "warning"; issues.push(`${recentSyslogErrors} syslog errors in 24h`); }
  if (suspendedSubscribers > activeSubscribers * 0.1) { healthStatus = "critical"; issues.push(`${suspendedSubscribers} suspended subscribers (>10% of active)`); }

  return ok({ healthData, healthStatus, issues });
});

// POST /api/v1/ai-diagnosis — run AI analysis on network health
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("ai", "ai.diagnosis.use");

  // Gather the same health data
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    activeSessions, totalSubscribers, activeSubscribers, suspendedSubscribers,
    overdueInvoices, openComplaints, openIncidents, activeAlerts,
    onlineNas, totalNas, recentSyslogErrors, recentPayments,
  ] = await Promise.all([
    db.activeSession.count({ where: { tenantId: ctx.tenantId, status: "active" } }),
    db.subscriber.count({ where: { tenantId: ctx.tenantId } }),
    db.subscriber.count({ where: { tenantId: ctx.tenantId, status: "active" } }),
    db.subscriber.count({ where: { tenantId: ctx.tenantId, status: "suspended" } }),
    db.invoice.count({ where: { tenantId: ctx.tenantId, status: "overdue" } }),
    db.complaint.count({ where: { tenantId: ctx.tenantId, status: { in: ["open", "in_progress"] } } }),
    db.incident.count({ where: { tenantId: ctx.tenantId, status: { in: ["open", "acknowledged"] } } }),
    db.alert.count({ where: { tenantId: ctx.tenantId, status: "active" } }),
    db.nasClient.count({ where: { tenantId: ctx.tenantId, status: "active" } }),
    db.nasClient.count({ where: { tenantId: ctx.tenantId } }),
    db.syslogEntry.count({ where: { tenantId: ctx.tenantId, severity: { in: ["error", "critical", "emergency"] }, receivedAt: { gte: last24h } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { tenantId: ctx.tenantId, status: "completed", receivedAt: { gte: last24h } } }),
  ]);

  const healthSummary = `Network Health Report:
- Active Sessions: ${activeSessions} / 100,000 capacity
- Subscribers: ${totalSubscribers} total (${activeSubscribers} active, ${suspendedSubscribers} suspended)
- Billing: ${overdueInvoices} overdue invoices, $${recentPayments._sum.amount?.toNumber() ?? 0} collected in 24h
- Operations: ${openComplaints} open complaints, ${openIncidents} open incidents, ${activeAlerts} active alerts
- Network: ${onlineNas}/${totalNas} NAS online, ${recentSyslogErrors} syslog errors in 24h

Please analyze this network health data and provide:
1. Overall health assessment (healthy/warning/critical)
2. Top 3 concerns that need immediate attention
3. Recommended actions for each concern
4. Capacity planning insights`;

  let aiResponse: string;
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: "You are Cryptsk AI Diagnosis, an expert network operations analyst. Analyze network health data and provide actionable insights. Be concise and specific. Format with clear headings.",
        },
        {
          role: "user",
          content: healthSummary,
        },
      ],
      thinking: { type: "disabled" },
    });

    aiResponse = completion.choices[0]?.message?.content ?? "Unable to generate diagnosis.";
  } catch (err) {
    console.error("[ai-diagnosis] LLM error:", err);
    aiResponse = `**Network Health Analysis** (Rule-based fallback)

**Overall Status:** ${activeAlerts > 0 || openIncidents > 0 ? "⚠️ Warning" : "✅ Healthy"}

**Key Metrics:**
- Active Sessions: ${activeSessions}
- Active Subscribers: ${activeSubscribers} (${suspendedSubscribers} suspended)
- Overdue Invoices: ${overdueInvoices}
- Open Complaints: ${openComplaints}
- Open Incidents: ${openIncidents}
- Active Alerts: ${activeAlerts}
- NAS Online: ${onlineNas}/${totalNas}
- Syslog Errors (24h): ${recentSyslogErrors}

**Recommended Actions:**
${overdueInvoices > 0 ? `1. Follow up on ${overdueInvoices} overdue invoice(s) via Collections page\n` : ""}${openComplaints > 0 ? `2. Address ${openComplaints} open complaint(s)\n` : ""}${activeAlerts > 0 ? `3. Acknowledge ${activeAlerts} active alert(s) in Monitoring\n` : ""}${openIncidents > 0 ? `4. Resolve ${openIncidents} incident(s) in Operations\n` : ""}5. Monitor session growth for capacity planning

Note: AI service unavailable — showing rule-based analysis.`;
  }

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "ai.diagnosis.run",
    module: "ai", resource: "AiDiagnosis", requestId,
    message: "AI Diagnosis run completed",
  });

  return ok({
    diagnosis: aiResponse,
    healthData: {
      activeSessions, totalSubscribers, activeSubscribers, suspendedSubscribers,
      overdueInvoices, openComplaints, openIncidents, activeAlerts,
      onlineNas, totalNas, recentSyslogErrors,
      revenue24h: recentPayments._sum.amount?.toNumber() ?? 0,
    },
    timestamp: now.toISOString(),
  });
});
