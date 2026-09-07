// =====================================================================
// COLLECTIONS API — list collection tasks + overdue invoices
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/collections — list overdue invoices + collection tasks
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("finance", "finance.collection.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");

  // Fetch overdue and partial invoices
  const where = {
    tenantId: ctx.tenantId,
    status: { in: ["overdue", "partial", "issued"] },
    ...(search ? {
      OR: [
        { number: { contains: search } },
        { subscriber: { customerId: { contains: search } } },
        { subscriber: { firstName: { contains: search } } },
        { subscriber: { lastName: { contains: search } } },
      ],
    } : {}),
  };

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { dueDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true, phone: true, email: true, status: true } },
      },
    }),
    db.invoice.count({ where }),
  ]);

  // Calculate days overdue for each
  const now = new Date();
  return paginated(
    invoices.map((inv) => {
      const balanceDue = inv.total.toNumber() - inv.amountPaid.toNumber();
      const daysOverdue = inv.dueDate < now ? Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return {
        id: inv.id,
        number: inv.number,
        subscriber: inv.subscriber
          ? {
              customerId: inv.subscriber.customerId,
              name: `${inv.subscriber.firstName} ${inv.subscriber.lastName}`,
              phone: inv.subscriber.phone,
              email: inv.subscriber.email,
              status: inv.subscriber.status,
            }
          : null,
        total: inv.total.toNumber(),
        amountPaid: inv.amountPaid.toNumber(),
        balanceDue,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        daysOverdue,
        status: inv.status,
        currency: inv.currency,
      };
    }),
    { page, pageSize, total },
    requestId
  );
});

const updateSchema = z.object({
  action: z.enum(["mark_contacted", "mark_resolved", "escalate"]),
  contactMethod: z.string().optional(),
  contactNotes: z.string().max(2000).optional(),
});

// PATCH /api/v1/collections — update collection status (creates CollectionTask)
export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("finance", "finance.collection.write");
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const { invoiceId } = body as { invoiceId?: string };
  if (!invoiceId) throw ApiError.businessRule("invoiceId is required");

  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, tenantId: ctx.tenantId } });
  if (!invoice) throw ApiError.notFound("Invoice", invoiceId);

  const balanceDue = invoice.total.toNumber() - invoice.amountPaid.toNumber();
  const now = new Date();
  const daysOverdue = invoice.dueDate < now ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  // Create a collection task
  const task = await db.collectionTask.create({
    data: {
      tenantId: ctx.tenantId,
      invoiceId,
      subscriberId: invoice.subscriberId,
      type: parsed.data.action === "escalate" ? "final_notice" : parsed.data.action === "mark_resolved" ? "reminder" : "warning",
      status: parsed.data.action === "mark_resolved" ? "resolved" : parsed.data.action === "escalate" ? "escalated" : "contacted",
      amount: balanceDue,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      daysOverdue,
      contactMethod: parsed.data.contactMethod || null,
      contactNotes: parsed.data.contactNotes || null,
      contactedAt: parsed.data.action !== "escalate" ? now : null,
      resolvedAt: parsed.data.action === "mark_resolved" ? now : null,
      assignedTo: ctx.userId,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: `collection.${parsed.data.action}`,
    module: "finance", resource: "Invoice", resourceId: invoiceId, requestId,
    newValue: { taskId: task.id, action: parsed.data.action, contactMethod: parsed.data.contactMethod },
    message: `Collection action on invoice ${invoice.number}: ${parsed.data.action}`,
  });

  return ok({ taskId: task.id, action: parsed.data.action, status: task.status });
});
