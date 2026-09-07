// =====================================================================
// MONITORING REPOSITORY — metrics, alerts, syslog, traffic analytics
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { parsePagination, type PaginatedResult } from "@/core/repositories/base";

// ---------------------------------------------------------------------
// METRICS — time-series data
// ---------------------------------------------------------------------

export async function recordMetric(
  tenantId: string,
  metric: string,
  value: number,
  unit: string,
  source?: string,
  nasId?: string
): Promise<void> {
  await db.metricData.create({
    data: { tenantId, metric, value, unit, source: source ?? null, nasId: nasId ?? null },
  });
}

export interface MetricSeries {
  metric: string;
  unit: string;
  points: Array<{ timestamp: string; value: number }>;
}

export async function getMetricSeries(
  tenantId: string,
  metric: string,
  startDate: Date,
  endDate: Date,
  intervalMinutes = 5
): Promise<MetricSeries> {
  const data = await db.metricData.findMany({
    where: { tenantId, metric, recordedAt: { gte: startDate, lte: endDate } },
    orderBy: { recordedAt: "asc" },
    select: { value: true, unit: true, recordedAt: true },
  });

  const intervalMs = intervalMinutes * 60 * 1000;
  const buckets = new Map<number, { sum: number; count: number; unit: string }>();

  for (const point of data) {
    const bucketTime = Math.floor(point.recordedAt.getTime() / intervalMs) * intervalMs;
    const existing = buckets.get(bucketTime) ?? { sum: 0, count: 0, unit: point.unit };
    existing.sum += point.value;
    existing.count++;
    existing.unit = point.unit;
    buckets.set(bucketTime, existing);
  }

  const points = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([timestamp, agg]) => ({
      timestamp: new Date(timestamp).toISOString(),
      value: agg.sum / agg.count,
    }));

  return { metric, unit: data[0]?.unit ?? "mbps", points };
}

export async function getCurrentMetrics(tenantId: string) {
  const metrics = await db.metricData.findMany({
    where: { tenantId },
    orderBy: { recordedAt: "desc" },
    distinct: ["metric"],
    take: 20,
    select: { metric: true, value: true, unit: true, recordedAt: true },
  });
  return metrics.map((m) => ({
    metric: m.metric,
    value: m.value,
    unit: m.unit,
    recordedAt: m.recordedAt,
  }));
}

// ---------------------------------------------------------------------
// TRAFFIC ANALYTICS — top talkers from active sessions
// ---------------------------------------------------------------------

export async function getTopTalkers(tenantId: string, limit = 10) {
  const sessions = await db.activeSession.findMany({
    where: { tenantId, status: "active" },
    orderBy: { outputOctets: "desc" },
    take: limit,
    include: {
      nas: { select: { name: true } },
      subscriber: { select: { customerId: true, firstName: true, lastName: true } },
    },
  });

  return sessions.map((s) => ({
    username: s.username,
    subscriberId: s.subscriberId,
    totalOctets: Number(s.inputOctets) + Number(s.outputOctets),
    inputOctets: Number(s.inputOctets),
    outputOctets: Number(s.outputOctets),
    nasName: s.nas.name,
    duration: Math.floor((Date.now() - s.startTime.getTime()) / 1000),
  }));
}

export async function getTrafficByNas(tenantId: string) {
  const nasClients = await db.nasClient.findMany({
    where: { tenantId, status: "active" },
    include: {
      activeSessions: {
        where: { status: "active" },
        select: { inputOctets: true, outputOctets: true },
      },
    },
  });

  return nasClients.map((n) => ({
    nasId: n.id,
    nasName: n.name,
    nasIp: n.ipAddress,
    sessionCount: n.activeSessions.length,
    totalDown: n.activeSessions.reduce((sum, s) => sum + Number(s.outputOctets), 0),
    totalUp: n.activeSessions.reduce((sum, s) => sum + Number(s.inputOctets), 0),
  }));
}

// ---------------------------------------------------------------------
// ALERTS — list, acknowledge, resolve
// ---------------------------------------------------------------------

export async function listAlerts(
  tenantId: string,
  filters: { search?: string; status?: string; severity?: string; category?: string },
  query: URLSearchParams
): Promise<PaginatedResult<any[]>> {
  const { page, pageSize } = parsePagination(query);
  const where: Prisma.AlertWhereInput = {
    tenantId,
    ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.severity && filters.severity !== "all" ? { severity: filters.severity } : {}),
    ...(filters.category && filters.category !== "all" ? { category: filters.category } : {}),
    ...(filters.search ? { OR: [{ title: { contains: filters.search } }, { description: { contains: filters.search } }, { alertNo: { contains: filters.search } }] } : {}),
  };

  const [alerts, total] = await Promise.all([
    db.alert.findMany({ where, orderBy: { triggeredAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.alert.count({ where }),
  ]);

  return { data: alerts, total, page, pageSize };
}

export async function acknowledgeAlert(tenantId: string, id: string, userId: string): Promise<void> {
  await db.alert.update({ where: { id, tenantId }, data: { status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: userId } });
}

export async function resolveAlert(tenantId: string, id: string, resolution: string): Promise<void> {
  await db.alert.update({ where: { id, tenantId }, data: { status: "resolved", resolvedAt: new Date(), resolution } });
}

// ---------------------------------------------------------------------
// SYSLOG
// ---------------------------------------------------------------------

export async function listSyslog(
  tenantId: string,
  filters: { search?: string; severity?: string; facility?: string; nasId?: string },
  query: URLSearchParams
): Promise<PaginatedResult<any[]>> {
  const { page, pageSize } = parsePagination(query);
  const where: Prisma.SyslogEntryWhereInput = {
    tenantId,
    ...(filters.severity && filters.severity !== "all" ? { severity: filters.severity } : {}),
    ...(filters.facility && filters.facility !== "all" ? { facility: filters.facility } : {}),
    ...(filters.nasId && filters.nasId !== "all" ? { nasId: filters.nasId } : {}),
    ...(filters.search ? { message: { contains: filters.search } } : {}),
  };

  const [entries, total] = await Promise.all([
    db.syslogEntry.findMany({ where, orderBy: { receivedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.syslogEntry.count({ where }),
  ]);

  return { data: entries, total, page, pageSize };
}

// ---------------------------------------------------------------------
// UPTIME & LATENCY
// ---------------------------------------------------------------------

export async function getUptimeStats(tenantId: string) {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [latencyMetrics, alertCount] = await Promise.all([
    db.metricData.findMany({ where: { tenantId, metric: "latency", recordedAt: { gte: last24h } }, select: { value: true } }),
    db.alert.count({ where: { tenantId, severity: { in: ["error", "critical"] }, triggeredAt: { gte: last24h } } }),
  ]);

  const avgLatency = latencyMetrics.length > 0 ? latencyMetrics.reduce((sum, m) => sum + m.value, 0) / latencyMetrics.length : 0;
  const downtimeMinutes = alertCount * 5;
  const totalMinutes = 24 * 60;
  const uptimePct = Math.max(0, ((totalMinutes - downtimeMinutes) / totalMinutes) * 100);

  return { uptimePct, avgLatencyMs: avgLatency, last24h: { uptimePct, avgLatencyMs: avgLatency, incidents: alertCount } };
}
