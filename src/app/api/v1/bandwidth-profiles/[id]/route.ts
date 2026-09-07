// =====================================================================
// BANDWIDTH PROFILE DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const profile = await db.bandwidthProfile.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!profile) throw ApiError.notFound("Profile", id);
  return ok(profile);
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  downloadSpeed: z.number().int().min(0).optional(),
  uploadSpeed: z.number().int().min(0).optional(),
  downloadBurst: z.number().int().optional(),
  uploadBurst: z.number().int().optional(),
  burstThreshold: z.number().int().optional(),
  burstTime: z.number().int().optional(),
  priority: z.number().int().min(1).max(8).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.bandwidthProfile.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Profile", id);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.description === "") data.description = null;

  const updated = await db.bandwidthProfile.update({ where: { id }, data });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "bandwidth.update", module: "policy", resource: "BandwidthProfile", resourceId: id, requestId, message: `Updated bandwidth profile ${updated.name}` });
  return ok({ id: updated.id, name: updated.name, status: updated.status });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.bandwidth.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.bandwidthProfile.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Profile", id);
  await db.bandwidthProfile.delete({ where: { id } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "bandwidth.delete", module: "policy", resource: "BandwidthProfile", resourceId: id, requestId, message: `Deleted bandwidth profile ${existing.name}` });
  return ok({ deleted: true, id });
});
