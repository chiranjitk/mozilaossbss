// =====================================================================
// PAYMENT GATEWAYS API — list + create + adapter catalog
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { listAdapters } from "@/core/payments/adapters";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/payment-gateways
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.gateway.configure");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);

  const [gateways, total] = await Promise.all([
    db.paymentGatewayConfig.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    db.paymentGatewayConfig.count({ where: { tenantId: ctx.tenantId } }),
  ]);

  // Also return the adapter catalog (available adapters to configure)
  const adapters = listAdapters();

  return paginated(
    gateways.map((g) => ({
      id: g.id,
      name: g.name,
      displayName: g.displayName,
      adapter: g.adapter,
      enabled: g.enabled,
      isDefault: g.isDefault,
      testMode: g.testMode,
      hasConfig: !!g.config,
      lastUsedAt: g.lastUsedAt,
      supportedMethods: g.supportedMethods ? JSON.parse(g.supportedMethods) : [],
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
  // Note: adapters catalog is returned via separate endpoint below
});

const createSchema = z.object({
  name: z.string().min(2, "Name required").max(50),
  displayName: z.string().max(100).optional().or(z.literal("")),
  adapter: z.enum(["manual", "stripe", "razorpay", "paypal"]),
  enabled: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  testMode: z.boolean().default(true),
  config: z.record(z.string()).optional(),
  supportedMethods: z.array(z.string()).optional(),
});

// POST /api/v1/payment-gateways
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("payments", "payment.gateway.configure");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data = parsed.data;

  // Check duplicate name
  const existing = await db.paymentGatewayConfig.findUnique({
    where: { tenantId_name: { tenantId: ctx.tenantId, name: data.name } },
  });
  if (existing) throw ApiError.duplicate("Gateway", "name", data.name);

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await db.paymentGatewayConfig.updateMany({
      where: { tenantId: ctx.tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const gateway = await db.paymentGatewayConfig.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      displayName: data.displayName || null,
      adapter: data.adapter,
      enabled: data.enabled,
      isDefault: data.isDefault,
      testMode: data.testMode,
      config: data.config ? JSON.stringify(data.config) : null,
      supportedMethods: data.supportedMethods ? JSON.stringify(data.supportedMethods) : null,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "gateway.create",
    module: "payments", resource: "PaymentGatewayConfig", resourceId: gateway.id, requestId,
    message: `Created payment gateway ${gateway.name} (${gateway.adapter})`,
  });

  return created({ id: gateway.id, name: gateway.name, adapter: gateway.adapter, enabled: gateway.enabled }, requestId);
});
