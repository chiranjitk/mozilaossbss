// =====================================================================
// CAPTIVE PORTALS API — list, create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/captive-portals
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const template = url.searchParams.get("template");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(template && template !== "all" ? { template } : {}),
    ...(search
      ? {
          OR: [{ name: { contains: search } }, { welcomeMessage: { contains: search } }],
        }
      : {}),
  };

  const [portals, total] = await Promise.all([
    db.captivePortal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { sessions: true } },
      },
    }),
    db.captivePortal.count({ where }),
  ]);

  // Active sessions across all portals — surfaced for stat tiles
  const activeSessionCount = await db.captivePortalSession.count({
    where: { tenantId: ctx.tenantId, status: "active" },
  });

  return paginated(
    portals.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      loginMethod: p.loginMethod,
      sessionTimeout: p.sessionTimeout,
      bandwidthLimit: p.bandwidthLimit,
      redirectUrl: p.redirectUrl,
      welcomeMessage: p.welcomeMessage,
      template: p.template,
      logoUrl: p.logoUrl,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      sessionCount: p._count.sessions,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  enabled: z.boolean().default(true),
  loginMethod: z
    .enum(["radius", "voucher", "click_to_continue", "mac_auth", "social"])
    .default("radius"),
  sessionTimeout: z.number().int().min(60).max(604800).default(86400),
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
    .default("isp_default"),
  logoUrl: z.string().url().optional().or(z.literal("")).or(z.null()),
  customCss: z.string().max(20000).optional().or(z.literal("")),
  status: z.enum(["active", "disabled"]).default("active"),
});

// POST /api/v1/captive-portals
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.nas.update");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const existing = await db.captivePortal.findFirst({
    where: { tenantId: ctx.tenantId, name: data.name },
  });
  if (existing) {
    throw ApiError.duplicate("Captive Portal", "name", data.name);
  }

  const portal = await db.captivePortal.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      enabled: data.enabled,
      loginMethod: data.loginMethod,
      sessionTimeout: data.sessionTimeout,
      bandwidthLimit: data.bandwidthLimit ?? null,
      redirectUrl: data.redirectUrl || null,
      welcomeMessage: data.welcomeMessage || null,
      termsOfService: data.termsOfService || null,
      allowedHosts: data.allowedHosts ? JSON.stringify(data.allowedHosts) : null,
      template: data.template,
      logoUrl: data.logoUrl || null,
      customCss: data.customCss || null,
      status: data.status,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "captive_portal.create",
    module: "aaa",
    resource: "CaptivePortal",
    resourceId: portal.id,
    requestId,
    newValue: { name: portal.name, loginMethod: portal.loginMethod, template: portal.template },
    message: `Created captive portal "${portal.name}"`,
  });

  return created(
    {
      id: portal.id,
      name: portal.name,
      status: portal.status,
      enabled: portal.enabled,
    },
    requestId
  );
});
