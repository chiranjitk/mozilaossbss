// =====================================================================
// INVOICES API — list, create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { eventBus, EVENTS } from "@/core/events/bus";
import {
  listInvoices,
  createInvoice,
} from "@/core/repositories/billing/invoice";

export const dynamic = "force-dynamic";

// GET /api/v1/invoices
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const subscriberId = url.searchParams.get("subscriberId") ?? undefined;

  const result = await listInvoices(
    ctx.tenantId,
    { search, status, subscriberId },
    url.searchParams
  );

  return paginated(
    result.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      subscriberId: inv.subscriberId,
      subscriber: inv.subscriber
        ? {
            customerId: inv.subscriber.customerId,
            name: `${inv.subscriber.firstName} ${inv.subscriber.lastName}`,
            planName: inv.subscriber.plan?.name ?? null,
          }
        : null,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      subtotal: inv.subtotal.toNumber(),
      taxAmount: inv.taxAmount.toNumber(),
      total: inv.total.toNumber(),
      amountPaid: inv.amountPaid.toNumber(),
      balanceDue: inv.total.toNumber() - inv.amountPaid.toNumber(),
      status: inv.status,
      currency: inv.currency,
      paymentCount: inv._count.payments,
      hasPayments: inv.payments.length > 0,
    })),
    { page: result.page, pageSize: result.pageSize, total: result.total },
    requestId
  );
});

const lineItemSchema = z.object({
  description: z.string().min(1, "Description required"),
  quantity: z.number().min(1).default(1),
  unitPrice: z.number().min(0),
  amount: z.number().min(0),
});

const createInvoiceSchema = z.object({
  subscriberId: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item required"),
  taxRate: z.number().min(0).max(1).default(0),
  dueInDays: z.number().int().min(1).max(365).default(7),
  currency: z.string().default("USD"),
  status: z.enum(["draft", "issued"]).default("issued"),
});

// POST /api/v1/invoices
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.create");
  const body = await req.json();
  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  const invoice = await createInvoice({
    tenantId: ctx.tenantId,
    ...parsed.data,
    issuedBy: ctx.userId,
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "invoice.create",
    module: "billing",
    resource: "Invoice",
    resourceId: invoice.id,
    requestId,
    newValue: { number: invoice.number, total: invoice.total.toNumber(), subscriberId: invoice.subscriberId },
    message: `Created invoice ${invoice.number} (${invoice.currency} ${invoice.total.toNumber()})`,
  });

  await eventBus.emit(
    EVENTS.INVOICE_CREATED,
    { invoiceId: invoice.id, number: invoice.number, total: invoice.total.toNumber(), subscriberId: invoice.subscriberId },
    { tenantId: ctx.tenantId, source: "billing", requestId }
  );

  return created(
    {
      id: invoice.id,
      number: invoice.number,
      total: invoice.total.toNumber(),
      status: invoice.status,
    },
    requestId
  );
});
