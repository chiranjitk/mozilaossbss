// =====================================================================
// LEAD DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/leads/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.lead.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const lead = await db.lead.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!lead) {
    throw ApiError.notFound("Lead", id);
  }

  return ok({
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    areaId: lead.areaId,
    source: lead.source,
    status: lead.status,
    interestedPlanId: lead.interestedPlanId,
    estimatedValue: lead.estimatedValue,
    notes: lead.notes,
    followUpDate: lead.followUpDate,
    convertedSubscriberId: lead.convertedSubscriberId,
    assignedTo: lead.assignedTo,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  });
});

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  email: z.string().email().max(160).optional().or(z.literal("")).or(z.null()),
  phone: z.string().max(40).optional().or(z.literal("")).or(z.null()),
  address: z.string().max(500).optional().or(z.literal("")).or(z.null()),
  areaId: z.string().max(120).optional().or(z.literal("")).or(z.null()),
  source: z
    .enum(["website", "whatsapp", "referral", "walk_in", "call", "social_media", "other"])
    .optional(),
  status: z
    .enum(["new", "contacted", "interested", "qualified", "converted", "lost"])
    .optional(),
  interestedPlanId: z.string().max(120).optional().or(z.literal("")).or(z.null()),
  estimatedValue: z.number().min(0).optional().or(z.null()),
  notes: z.string().max(2000).optional().or(z.literal("")).or(z.null()),
  followUpDate: z.string().datetime().optional().or(z.literal("")).or(z.null()),
  assignedTo: z.string().max(120).optional().or(z.literal("")).or(z.null()),
});

// PATCH /api/v1/leads/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.lead.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.lead.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Lead", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const updated = await db.lead.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.address !== undefined ? { address: data.address || null } : {}),
      ...(data.areaId !== undefined ? { areaId: data.areaId || null } : {}),
      ...(data.source !== undefined ? { source: data.source } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.interestedPlanId !== undefined
        ? { interestedPlanId: data.interestedPlanId || null }
        : {}),
      ...(data.estimatedValue !== undefined ? { estimatedValue: data.estimatedValue } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.followUpDate !== undefined
        ? { followUpDate: data.followUpDate ? new Date(data.followUpDate) : null }
        : {}),
      ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo || null } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "lead.update",
    module: "operations",
    resource: "Lead",
    resourceId: id,
    requestId,
    oldValue: {
      name: existing.name,
      status: existing.status,
      source: existing.source,
    },
    newValue: data,
    message: `Updated lead "${updated.name}"`,
  });

  return ok({
    id: updated.id,
    name: updated.name,
    status: updated.status,
  });
});

// DELETE /api/v1/leads/[id]
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.lead.write");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.lead.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("Lead", id);
  }

  await db.lead.delete({ where: { id } });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "lead.delete",
    module: "operations",
    resource: "Lead",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, status: existing.status },
    message: `Deleted lead "${existing.name}"`,
  });

  return ok({ deleted: true, id });
});
