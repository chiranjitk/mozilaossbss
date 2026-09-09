// =====================================================================
// TIME ACCESS DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { removeGroupFromRadius } from "@/core/policy/radius-sync";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.timeaccess.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const p = await db.timeAccessProfile.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!p) throw ApiError.notFound("Profile", id);
  return ok({ ...p, schedule: p.schedule ? JSON.parse(p.schedule) : null });
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  schedule: z.record(z.any()).optional(),
  timezone: z.string().optional(),
  action: z.enum(["allow", "deny"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.timeaccess.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.timeAccessProfile.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Profile", id);
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.schedule) data.schedule = JSON.stringify(data.schedule);
  if (data.description === "") data.description = null;
  const updated = await db.timeAccessProfile.update({ where: { id }, data });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "timeaccess.update", module: "policy", resource: "TimeAccessProfile", resourceId: id, requestId, message: `Updated time access profile ${updated.name}` });
  return ok({ id: updated.id, name: updated.name, status: updated.status });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.timeaccess.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.timeAccessProfile.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Profile", id);
  await db.timeAccessProfile.delete({ where: { id } });
  // Clean up synced RADIUS Login-Time rows for this group
  await removeGroupFromRadius(existing.name);
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "timeaccess.delete", module: "policy", resource: "TimeAccessProfile", resourceId: id, requestId, message: `Deleted time access profile ${existing.name} + RADIUS group rows` });
  return ok({ deleted: true, id });
});
