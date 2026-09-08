// =====================================================================
// CAPTIVE PORTAL DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

function portalIdFromReq(req: NextRequest): string {
  return new URL(req.url).pathname.split("/")[4];
}

// GET /api/v1/captive-portals/[id]
export const GET = apiRoute(async (req: NextRequest) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const id = portalIdFromReq(req);

  const portal = await db.captivePortal.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { _count: { select: { sessions: true } } },
  });
  if (!portal) {
    throw ApiError.notFound("Captive Portal", id);
  }

  return ok({
    id: portal.id,
    name: portal.name,
    enabled: portal.enabled,
    loginMethod: portal.loginMethod,
    sessionTimeout: portal.sessionTimeout,
    bandwidthLimit: portal.bandwidthLimit,
    redirectUrl: portal.redirectUrl,
    welcomeMessage: portal.welcomeMessage,
    termsOfService: portal.termsOfService,
    allowedHosts: portal.allowedHosts,
    template: portal.template,
    logoUrl: portal.logoUrl,
    customCss: portal.customCss,
    status: portal.status,
    createdAt: portal.createdAt,
    updatedAt: portal.updatedAt,
    sessionCount: portal._count.sessions,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  loginMethod: z
    .enum(["radius", "voucher", "click_to_continue", "mac_auth", "social"])
    .optional(),
  sessionTimeout: z.number().int().min(60).max(604800).optional(),
  bandwidthLimit: z.number().int().min(0).nullable().optional(),
  redirectUrl: z.string().url().optional().or(z.literal("")).or(z.null()),
  welcomeMessage: z.string().max(1000).optional().or(z.literal("")),
  termsOfService: z.string().max(5000).optional().or(z.literal("")),
  allowedHosts: z.array(z.string()).optional(),
  template: z
    .enum([
      "isp_default",
      "hotel",
      "cafe",
      "airport",
      "resort",
      "corporate",
      "custom",
    ])
    .optional(),
  logoUrl: z.string().url().optional().or(z.literal("")).or(z.null()),
  customCss: z.string().max(20000).optional().or(z.literal("")),
  status: z.enum(["active", "disabled"]).optional(),
});

// PATCH /api/v1/captive-portals/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = portalIdFromReq(req);

  const existing = await db.captivePortal.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Captive Portal", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  if (data.name && data.name !== existing.name) {
    const conflict = await db.captivePortal.findFirst({
      where: { tenantId: ctx.tenantId, name: data.name, NOT: { id } },
    });
    if (conflict) {
      throw ApiError.duplicate("Captive Portal", "name", data.name);
    }
  }

  const updated = await db.captivePortal.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.loginMethod !== undefined ? { loginMethod: data.loginMethod } : {}),
      ...(data.sessionTimeout !== undefined ? { sessionTimeout: data.sessionTimeout } : {}),
      ...(data.bandwidthLimit !== undefined ? { bandwidthLimit: data.bandwidthLimit } : {}),
      ...(data.redirectUrl !== undefined ? { redirectUrl: data.redirectUrl || null } : {}),
      ...(data.welcomeMessage !== undefined ? { welcomeMessage: data.welcomeMessage || null } : {}),
      ...(data.termsOfService !== undefined ? { termsOfService: data.termsOfService || null } : {}),
      ...(data.allowedHosts !== undefined
        ? { allowedHosts: JSON.stringify(data.allowedHosts) }
        : {}),
      ...(data.template !== undefined ? { template: data.template } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl || null } : {}),
      ...(data.customCss !== undefined ? { customCss: data.customCss || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "captive_portal.update",
    module: "aaa",
    resource: "CaptivePortal",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      enabled: existing.enabled,
      status: existing.status,
      loginMethod: existing.loginMethod,
    },
    newValue: data,
    message: `Updated captive portal "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    status: updated.status,
    enabled: updated.enabled,
  });
});

// DELETE /api/v1/captive-portals/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const id = portalIdFromReq(req);

  const existing = await db.captivePortal.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Captive Portal", id);
  }

  await db.captivePortal.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "captive_portal.delete",
    module: "aaa",
    resource: "CaptivePortal",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, template: existing.template },
    message: `Deleted captive portal "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
