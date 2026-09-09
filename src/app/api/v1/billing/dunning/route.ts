// =====================================================================
// DUNNING API — process the failed-payment retry queue
// POST /api/v1/billing/dunning   → run dunning cycle
// GET  /api/v1/billing/dunning   → preview due-for-retry invoices
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import {
  processDunningQueue,
  DEFAULT_DUNNING_CONFIG,
} from "@/core/billing/dunning";

export const dynamic = "force-dynamic";

// GET — preview which invoices are due for a dunning retry right now
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.read");
  void req;
  const now = new Date();

  const overdueInvoices = await db.invoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { in: ["overdue", "partial"] },
      payments: { some: { status: "failed" } },
    },
    include: {
      subscriber: { select: { id: true, customerId: true, firstName: true, lastName: true, status: true } },
      payments: { where: { status: "failed" }, orderBy: { receivedAt: "desc" }, take: 1 },
    },
    orderBy: { dueDate: "asc" },
  });

  const preview = overdueInvoices.map((inv) => {
    const lastFailed = inv.payments[0];
    const items = inv.items ? (JSON.parse(inv.items) as any[]) : [];
    const dunningState = items.find((i) => i.__type === "dunning_state");
    const nextRetryAt = dunningState?.nextRetryAt
      ? new Date(dunningState.nextRetryAt)
      : lastFailed?.receivedAt ?? inv.dueDate;
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      subscriberId: inv.subscriberId,
      subscriberName: inv.subscriber
        ? `${inv.subscriber.firstName} ${inv.subscriber.lastName}`
        : null,
      subscriberStatus: inv.subscriber?.status ?? null,
      total: inv.total.toNumber(),
      amountPaid: inv.amountPaid.toNumber(),
      outstanding: inv.total.toNumber() - inv.amountPaid.toNumber(),
      dueDate: inv.dueDate,
      lastFailedAt: lastFailed?.receivedAt ?? null,
      nextRetryAt,
      dueNow: nextRetryAt.getTime() <= now.getTime(),
      attempts: dunningState?.attempts ?? 0,
    };
  });

  return ok(
    {
      total: preview.length,
      dueNow: preview.filter((p) => p.dueNow).length,
      invoices: preview,
      config: DEFAULT_DUNNING_CONFIG,
    },
    { requestId },
    requestId
  );
});

// POST — run the dunning cycle: retry charges + escalate
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("billing", "billing.invoice.update");
  void req;
  const result = await processDunningQueue(
    ctx.tenantId,
    DEFAULT_DUNNING_CONFIG,
    ctx.userId
  );

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "billing.dunning",
    module: "billing",
    resource: "Invoice",
    requestId,
    newValue: result,
    message: `Dunning cycle: ${result.processed} processed, ${result.succeeded} recovered, ${result.failed} retries failed, ${result.suspended} auto-suspended, ${result.collectionsCreated} collections tasks created.`,
  });

  return ok(result, { requestId }, requestId);
});
