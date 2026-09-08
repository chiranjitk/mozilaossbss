// =====================================================================
// RESELLERS API — list, create (channel partner management)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/resellers
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.reseller.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } },
            { email: { contains: search } },
            { contactPerson: { contains: search } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [resellers, total] = await Promise.all([
    db.reseller.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.reseller.count({ where }),
  ]);

  return paginated(
    resellers.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      email: r.email,
      phone: r.phone,
      address: r.address,
      contactPerson: r.contactPerson,
      status: r.status,
      commissionMethod: r.commissionMethod,
      commissionRate: r.commissionRate,
      creditLimit: r.creditLimit,
      balance: r.balance,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createResellerSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  code: z
    .string()
    .min(2, "Code is required")
    .max(60)
    .regex(/^[A-Z0-9_-]+$/i, "Code must be alphanumeric, dash, or underscore"),
  email: z.string().email().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  contactPerson: z.string().max(160).optional().or(z.literal("")),
  status: z.enum(["active", "suspended", "trial"]).default("active"),
  commissionMethod: z.enum(["percentage", "flat", "slab"]).default("percentage"),
  commissionRate: z.number().min(0).default(10),
  creditLimit: z.number().min(0).default(0),
  balance: z.number().optional().default(0),
});

// POST /api/v1/resellers
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.reseller.write");
  const body = await req.json();
  const parsed = createResellerSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Unique code check
  const existing = await db.reseller.findUnique({ where: { code: data.code } });
  if (existing) {
    throw ApiError.duplicate("Reseller", "code", data.code);
  }

  const reseller = await db.reseller.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      code: data.code.toUpperCase(),
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      contactPerson: data.contactPerson || null,
      status: data.status,
      commissionMethod: data.commissionMethod,
      commissionRate: data.commissionRate,
      creditLimit: data.creditLimit,
      balance: data.balance,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "reseller.create",
    module: "operations",
    resource: "Reseller",
    resourceId: reseller.id,
    requestId,
    newValue: {
      name: reseller.name,
      code: reseller.code,
      commissionMethod: reseller.commissionMethod,
      commissionRate: reseller.commissionRate,
    },
    message: `Created reseller "${reseller.name}" (${reseller.code})`,
  });

  return created(
    {
      id: reseller.id,
      name: reseller.name,
      code: reseller.code,
      status: reseller.status,
    },
    requestId
  );
});
