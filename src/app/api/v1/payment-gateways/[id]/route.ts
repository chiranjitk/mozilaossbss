// =====================================================================
// PAYMENT GATEWAY DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.gateway.configure");
  const id = new URL(req.url).pathname.split("/")[4];
  const gw = await db.paymentGatewayConfig.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!gw) throw ApiError.notFound("Gateway", id);
  return ok({
    ...gw,
    config: gw.config ? JSON.parse(gw.config) : null,
    supportedMethods: gw.supportedMethods ? JSON.parse(gw.supportedMethods) : [],
  });
});

const updateSchema = z.object({
  displayName: z.string().max(100).optional().or(z.literal("")),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  testMode: z.boolean().optional(),
  config: z.record(z.string()).optional(),
  supportedMethods: z.array(z.string()).optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.gateway.configure");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.paymentGatewayConfig.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Gateway", id);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  if (data.config) data.config = JSON.stringify(data.config);
  if (data.supportedMethods) data.supportedMethods = JSON.stringify(data.supportedMethods);
  if (data.displayName === "") data.displayName = null;

  // If setting as default, unset others
  if (data.isDefault) {
    await db.paymentGatewayConfig.updateMany({
      where: { tenantId: ctx.tenantId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await db.paymentGatewayConfig.update({ where: { id }, data });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "gateway.update",
    module: "payments", resource: "PaymentGatewayConfig", resourceId: id, requestId,
    oldValue: { enabled: existing.enabled, isDefault: existing.isDefault },
    newValue: parsed.data, message: `Updated gateway ${updated.name}`,
  });
  return ok({ id: updated.id, name: updated.name, enabled: updated.enabled, isDefault: updated.isDefault });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.gateway.configure");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.paymentGatewayConfig.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Gateway", id);
  await db.paymentGatewayConfig.delete({ where: { id } });
  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "gateway.delete",
    module: "payments", resource: "PaymentGatewayConfig", resourceId: id, requestId,
    message: `Deleted gateway ${existing.name}`,
  });
  return ok({ deleted: true, id });
});
