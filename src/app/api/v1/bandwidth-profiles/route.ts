// =====================================================================
// BANDWIDTH PROFILES API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
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
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "bandwidth.create", module: "policy", resource: "BandwidthProfile", resourceId: profile.id, requestId, message: `Created bandwidth profile ${profile.name}` });
  return created({ id: profile.id, name: profile.name, status: profile.status }, requestId);
});
