// =====================================================================
// COLLECTION AGENT DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/agents/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.agent.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const agent = await db.collectionAgent.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!agent) {
    throw ApiError.notFound("CollectionAgent", id);
  }

  return ok({
    id: agent.id,
    userId: agent.userId,
    name: agent.name,
    phone: agent.phone,
    email: agent.email,
    employeeId: agent.employeeId,
    status: agent.status,
    dailyTarget: agent.dailyTarget,
    monthlyTarget: agent.monthlyTarget,
    commissionRate: agent.commissionRate,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  phone: z.string().max(40).optional().or(z.literal("")).or(z.null()),
  email: z.string().email().max(160).optional().or(z.literal("")).or(z.null()),
  employeeId: z.string().max(40).optional().or(z.literal("")).or(z.null()),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  dailyTarget: z.number().min(0).optional(),
  monthlyTarget: z.number().min(0).optional(),
  commissionRate: z.number().min(0).optional(),
});

// PATCH /api/v1/agents/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.agent.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.collectionAgent.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("CollectionAgent", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Employee ID uniqueness within tenant
  if (data.employeeId && data.employeeId !== existing.employeeId) {
    const conflict = await db.collectionAgent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        employeeId: data.employeeId,
        NOT: { id },
      },
    });
    if (conflict) {
      throw ApiError.duplicate("Agent", "employee ID", data.employeeId);
    }
  }

  const updated = await db.collectionAgent.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.employeeId !== undefined ? { employeeId: data.employeeId || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.dailyTarget !== undefined ? { dailyTarget: data.dailyTarget } : {}),
      ...(data.monthlyTarget !== undefined ? { monthlyTarget: data.monthlyTarget } : {}),
      ...(data.commissionRate !== undefined ? { commissionRate: data.commissionRate } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "collection_agent.update",
    module: "operations",
    resource: "CollectionAgent",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      employeeId: existing.employeeId,
      dailyTarget: existing.dailyTarget,
      status: existing.status,
    },
    newValue: data,
    message: `Updated collection agent "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    status: updated.status,
  });
});

// DELETE /api/v1/agents/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.agent.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.collectionAgent.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("CollectionAgent", id);
  }

  await db.collectionAgent.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "collection_agent.delete",
    module: "operations",
    resource: "CollectionAgent",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, employeeId: existing.employeeId },
    message: `Deleted collection agent "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
