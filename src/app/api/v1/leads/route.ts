// =====================================================================
// LEADS API — list, create (CRM pipeline)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/leads
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.lead.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const assignedTo = url.searchParams.get("assignedTo");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(source && source !== "all" ? { source } : {}),
    ...(assignedTo && assignedTo !== "all" ? { assignedTo } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
            { notes: { contains: search } },
          ],
        }
      : {}),
  };

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ followUpDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.lead.count({ where }),
  ]);

  return paginated(
    leads.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      address: l.address,
      areaId: l.areaId,
      source: l.source,
      status: l.status,
      interestedPlanId: l.interestedPlanId,
      estimatedValue: l.estimatedValue,
      notes: l.notes,
      followUpDate: l.followUpDate,
      convertedSubscriberId: l.convertedSubscriberId,
      assignedTo: l.assignedTo,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createLeadSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  email: z.string().email().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  areaId: z.string().max(120).optional().or(z.literal("")).or(z.null()),
  source: z
    .enum(["website", "whatsapp", "referral", "walk_in", "call", "social_media", "other"])
    .default("website"),
  status: z
    .enum(["new", "contacted", "interested", "qualified", "converted", "lost"])
    .default("new"),
  interestedPlanId: z.string().max(120).optional().or(z.literal("")).or(z.null()),
  estimatedValue: z.number().min(0).optional().or(z.null()),
  notes: z.string().max(2000).optional().or(z.literal("")),
  followUpDate: z.string().datetime().optional().or(z.literal("")).or(z.null()),
  assignedTo: z.string().max(120).optional().or(z.literal("")).or(z.null()),
});

// POST /api/v1/leads
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("operations", "ops.lead.write");
  const body = await req.json();
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const lead = await db.lead.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      areaId: data.areaId || null,
      source: data.source,
      status: data.status,
      interestedPlanId: data.interestedPlanId || null,
      estimatedValue: data.estimatedValue === null || data.estimatedValue === undefined ? null : data.estimatedValue,
      notes: data.notes || null,
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      assignedTo: data.assignedTo || null,
    },
  });

  // === INDUSTRY STANDARD: Auto-calculate lead score ===
  let leadScore = 0;
  const scoreFactors: string[] = [];

  // Source scoring (higher quality sources = higher score)
  const sourceScores: Record<string, number> = {
    referral: 30, walk_in: 25, call: 20, website: 15, whatsapp: 15, social_media: 10, other: 5,
  };
  leadScore += sourceScores[lead.source] ?? 5;
  if (sourceScores[lead.source] >= 20) scoreFactors.push(`High-quality source: ${lead.source}`);

  // Phone provided = higher intent
  if (lead.phone) { leadScore += 15; scoreFactors.push("Phone number provided"); }
  // Email provided
  if (lead.email) { leadScore += 10; scoreFactors.push("Email provided"); }
  // Address provided
  if (lead.address) { leadScore += 5; scoreFactors.push("Address provided"); }
  // Interested in specific plan
  if (lead.interestedPlanId) { leadScore += 20; scoreFactors.push("Specific plan interest"); }
  // Estimated value
  if (lead.estimatedValue && lead.estimatedValue > 0) {
    leadScore += Math.min(20, Math.floor(lead.estimatedValue / 100));
    scoreFactors.push(`Estimated value: $${lead.estimatedValue}`);
  }
  // Assigned to agent = being worked
  if (lead.assignedTo) { leadScore += 10; scoreFactors.push("Assigned to agent"); }

  // Store score in notes (since Lead model doesn't have a score field)
  const existingNotes = lead.notes || "";
  const scoreNote = `\n[Lead Score: ${leadScore}/100 — ${scoreFactors.join(", ")}]`;
  await db.lead.update({
    where: { id: lead.id },
    data: { notes: existingNotes + scoreNote },
  });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "lead.create",
    module: "operations", resource: "Lead", resourceId: lead.id, requestId,
    newValue: { name: lead.name, source: lead.source, status: lead.status, score: leadScore },
    message: `Created lead "${lead.name}" (score: ${leadScore}/100)`,
  });

  return created({ id: lead.id, name: lead.name, status: lead.status, score: leadScore }, requestId);
});
