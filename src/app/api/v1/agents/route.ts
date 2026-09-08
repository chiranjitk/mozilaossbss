// =====================================================================
// COLLECTION AGENTS API — list, create (field collection agents)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/agents
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.agent.read");
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
            { employeeId: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}),
  };

  const [agents, total] = await Promise.all([
    db.collectionAgent.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.collectionAgent.count({ where }),
  ]);

  return paginated(
    agents.map((a) => ({
      id: a.id,
      userId: a.userId,
      name: a.name,
      phone: a.phone,
      email: a.email,
      employeeId: a.employeeId,
      status: a.status,
      dailyTarget: a.dailyTarget,
      monthlyTarget: a.monthlyTarget,
      commissionRate: a.commissionRate,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().max(160).optional().or(z.literal("")),
  employeeId: z.string().max(40).optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "suspended"]).default("active"),
  dailyTarget: z.number().min(0).default(0),
  monthlyTarget: z.number().min(0).default(0),
  commissionRate: z.number().min(0).default(5),
});

// POST /api/v1/agents
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.agent.write");
  const body = await req.json();
  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Employee ID uniqueness within tenant (if provided)
  if (data.employeeId) {
    const existing = await db.collectionAgent.findFirst({
      where: { tenantId: ctx.tenantId, employeeId: data.employeeId },
    });
    if (existing) {
      throw ApiError.duplicate("Agent", "employee ID", data.employeeId);
    }
  }

  const agent = await db.collectionAgent.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      employeeId: data.employeeId || null,
      status: data.status,
      dailyTarget: data.dailyTarget,
      monthlyTarget: data.monthlyTarget,
      commissionRate: data.commissionRate,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "collection_agent.create",
    module: "operations",
    resource: "CollectionAgent",
    resourceId: agent.id,
    requestId,
    newValue: {
      name: agent.name,
      employeeId: agent.employeeId,
      dailyTarget: agent.dailyTarget,
      monthlyTarget: agent.monthlyTarget,
    },
    message: `Created collection agent "${agent.name}"`,
  });

  return created(
    {
      id: agent.id,
      name: agent.name,
      status: agent.status,
    },
    requestId
  );
});
