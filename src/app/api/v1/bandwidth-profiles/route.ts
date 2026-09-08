// =====================================================================
// BANDWIDTH PROFILES API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus } from "@/core/events/bus";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { description: { contains: search } }] } : {}),
  };

  const [profiles, total] = await Promise.all([
    db.bandwidthProfile.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.bandwidthProfile.count({ where }),
  ]);

  return paginated(profiles.map((p) => ({
    id: p.id, name: p.name, description: p.description,
    downloadSpeed: p.downloadSpeed, uploadSpeed: p.uploadSpeed,
    downloadBurst: p.downloadBurst, uploadBurst: p.uploadBurst,
    burstThreshold: p.burstThreshold, burstTime: p.burstTime,
    priority: p.priority, status: p.status, assignedCount: p.assignedCount,
    createdAt: p.createdAt,
  })), { page, pageSize, total }, requestId);
});

const createSchema = z.object({
  name: z.string().min(2, "Name required").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  downloadSpeed: z.number().int().min(0),
  uploadSpeed: z.number().int().min(0),
  downloadBurst: z.number().int().optional(),
  uploadBurst: z.number().int().optional(),
  burstThreshold: z.number().int().optional(),
  burstTime: z.number().int().optional(),
  priority: z.number().int().min(1).max(8).default(8),
  status: z.enum(["active", "disabled"]).default("active"),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.description === "") data.description = null;

  const existing = await db.bandwidthProfile.findUnique({ where: { tenantId_name: { tenantId: ctx.tenantId, name: data.name } } });
  if (existing) throw ApiError.duplicate("Profile", "name", data.name);

  const profile = await db.bandwidthProfile.create({ data: { tenantId: ctx.tenantId, ...data } });

  // === INDUSTRY STANDARD: Sync to FreeRADIUS radgroupreply tables ===
  // When a bandwidth profile is created, automatically create the corresponding
  // RADIUS group reply attributes (Mikrotik-Rate-Limit, WISPr-Bandwidth-Max-Down/Up,
  // Session-Timeout, Idle-Timeout, Simultaneous-Use)
  const groupName = `plan-${profile.name.toLowerCase().replace(/\s+/g, "-")}`;
  const rateLimit = formatRateLimit(profile.downloadSpeed, profile.uploadSpeed, profile.downloadBurst, profile.uploadBurst, profile.burstThreshold, profile.burstTime);

  // Sync to radgroupreply
  await db.radGroupReply.createMany({
    data: [
      { groupname: groupName, attribute: "Mikrotik-Rate-Limit", op: ":=", value: rateLimit },
      { groupname: groupName, attribute: "WISPr-Bandwidth-Max-Down", op: ":=", value: String(profile.downloadSpeed) },
      { groupname: groupName, attribute: "WISPr-Bandwidth-Max-Up", op: ":=", value: String(profile.uploadSpeed) },
    ],
    skipDuplicates: true,
  });

  // Sync to radgroupcheck
  await db.radGroupCheck.createMany({
    data: [
      { groupname: groupName, attribute: "Simultaneous-Use", op: ":=", value: "1" },
      { groupname: groupName, attribute: "Session-Timeout", op: ":=", value: "86400" },
      { groupname: groupName, attribute: "Idle-Timeout", op: ":=", value: "1800" },
    ],
    skipDuplicates: true,
  });

  // Emit event for other modules (billing, monitoring)
  await eventBus.emit("policy.bandwidth.created", { profileId: profile.id, groupName, rateLimit }, { tenantId: ctx.tenantId, source: "policy", requestId });

  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "bandwidth.create", module: "policy", resource: "BandwidthProfile", resourceId: profile.id, requestId, message: `Created bandwidth profile ${profile.name} → synced to RADIUS group ${groupName}` });
  return created({ id: profile.id, name: profile.name, status: profile.status, radiusGroup: groupName }, requestId);
});

/**
 * Format Mikrotik-Rate-Limit string: "down/up burst-down/burst-up burst-threshold-down/up burst-time"
 * Example: "51200K/10240K 76800K/15360K 40960K/8192K 16"
 */
function formatRateLimit(down: number, up: number, burstDown?: number, burstUp?: number, threshold?: number, burstTime?: number): string {
  const downStr = formatKbps(down);
  const upStr = formatKbps(up);
  if (burstDown && burstUp && threshold && burstTime) {
    return `${downStr}/${upStr} ${formatKbps(burstDown)}/${formatKbps(burstUp)} ${formatKbps(threshold)}/${formatKbps(threshold)} ${burstTime}`;
  }
  return `${downStr}/${upStr}`;
}

function formatKbps(kbps: number): string {
  if (kbps >= 1000000) return `${(kbps / 1000000).toFixed(1)}G`;
  if (kbps >= 1000) return `${Math.round(kbps / 1000)}M`;
  return `${kbps}K`;
}
