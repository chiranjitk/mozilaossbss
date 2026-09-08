// =====================================================================
// CREDIT NOTE DETAIL API — GET, PATCH
// (no DELETE — credit notes are financial records; use status="cancelled")
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// GET /api/v1/credit-notes/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const note = await db.creditNote.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!note) {
    throw ApiError.notFound("CreditNote", id);
  }

  const invoice = await db.invoice.findFirst({
    where: { id: note.invoiceId, tenantId: ctx.tenantId },
    select: { id: true, number: true, subscriberId: true },
  });

  let subscriber = null;
  if (invoice?.subscriberId) {
    subscriber = await db.subscriber.findFirst({
      where: { id: invoice.subscriberId },
      select: { id: true, customerId: true, firstName: true, lastName: true },
    });
  }

  return ok({
    id: note.id,
    invoiceId: note.invoiceId,
    invoiceNumber: invoice?.number ?? null,
    number: note.number,
    amount: note.amount,
    reason: note.reason,
    status: note.status,
    issuedBy: note.issuedBy,
    issuedAt: note.issuedAt.toISOString(),
    createdAt: note.createdAt.toISOString(),
    subscriber,
  });
});

const updateSchema = z.object({
  reason: z.string().max(500).optional().or(z.literal("")).or(z.null()),
  status: z.enum(["issued", "applied", "cancelled"]).optional(),
});

// PATCH /api/v1/credit-notes/[id]
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.create");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.creditNote.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("CreditNote", id);
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const updated = await db.creditNote.update({
    where: { id },
    data: {
      ...(data.reason !== undefined ? { reason: data.reason || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "credit_note.update",
    module: "billing",
    resource: "CreditNote",
    resourceId: id,
    requestId,
    oldValue: { reason: existing.reason, status: existing.status },
    newValue: data,
    message: `Updated credit note ${existing.number} (status → ${updated.status})`,
  });

  return ok({
    id: updated.id,
    number: updated.number,
    status: updated.status,
    reason: updated.reason,
  });
});
