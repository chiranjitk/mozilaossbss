// =====================================================================
// AR AGING + PREPAID WALLET ENGINE
//
// 1. AR (Accounts Receivable) Aging report — buckets outstanding invoice
//    balances by age: 0-30, 31-60, 61-90, 90+ days. The standard report
//    finance teams use to assess collection risk.
//
// 2. Prepaid Wallet — subscribers on prepaid plans carry a wallet balance.
//    On each billing run (or real-time), the wallet is debited. When the
//    balance falls below zero, the subscriber is auto-suspended.
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------
// AR AGING
// ---------------------------------------------------------------------

export interface ArAgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  invoiceCount: number;
  totalAmount: number;
  subscribers: number;
}

export interface ArAgingReport {
  asOf: Date;
  currency: string;
  buckets: ArAgingBucket[];
  totalOutstanding: number;
  totalInvoices: number;
  totalSubscribers: number;
  atRiskAmount: number; // 61+ days
  atRiskPct: number;
}

export async function generateArAgingReport(
  tenantId: string,
  asOf?: Date
): Promise<ArAgingReport> {
  const now = asOf ?? new Date();

  const invoices = await db.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["issued", "partial", "overdue"] },
    },
    select: {
      id: true,
      number: true,
      subscriberId: true,
      total: true,
      amountPaid: true,
      issueDate: true,
      dueDate: true,
      currency: true,
    },
  });

  const buckets: ArAgingBucket[] = [
    { label: "Current (0-30)", minDays: 0, maxDays: 30, invoiceCount: 0, totalAmount: 0, subscribers: 0 },
    { label: "31-60 days", minDays: 31, maxDays: 60, invoiceCount: 0, totalAmount: 0, subscribers: 0 },
    { label: "61-90 days", minDays: 61, maxDays: 90, invoiceCount: 0, totalAmount: 0, subscribers: 0 },
    { label: "90+ days", minDays: 91, maxDays: null, invoiceCount: 0, totalAmount: 0, subscribers: 0 },
  ];

  const subscriberSets = buckets.map(() => new Set<string>());
  let totalOutstanding = 0;
  const currency = invoices[0]?.currency ?? "USD";

  for (const inv of invoices) {
    const outstanding = inv.total.toNumber() - inv.amountPaid.toNumber();
    if (outstanding <= 0) continue;
    // Age from the due date
    const ageDays = Math.floor(
      (now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const bucketIdx = ageDays < 0
      ? 0 // not yet due → current
      : ageDays <= 30
        ? 0
        : ageDays <= 60
          ? 1
          : ageDays <= 90
            ? 2
            : 3;
    buckets[bucketIdx].invoiceCount++;
    buckets[bucketIdx].totalAmount = round2(
      buckets[bucketIdx].totalAmount + outstanding
    );
    if (inv.subscriberId) subscriberSets[bucketIdx].add(inv.subscriberId);
    totalOutstanding = round2(totalOutstanding + outstanding);
  }

  buckets.forEach((b, i) => (b.subscribers = subscriberSets[i].size));

  const totalInvoices = buckets.reduce((s, b) => s + b.invoiceCount, 0);
  const totalSubscribers = new Set(
    invoices.filter((i) => i.subscriberId).map((i) => i.subscriberId!)
  ).size;
  const atRiskAmount = round2(buckets[2].totalAmount + buckets[3].totalAmount);
  const atRiskPct = totalOutstanding > 0
    ? round2((atRiskAmount / totalOutstanding) * 100)
    : 0;

  return {
    asOf: now,
    currency,
    buckets,
    totalOutstanding,
    totalInvoices,
    totalSubscribers,
    atRiskAmount,
    atRiskPct,
  };
}

// ---------------------------------------------------------------------
// PREPAID WALLET
// ---------------------------------------------------------------------

export interface PrepaidWallet {
  subscriberId: string;
  customerId: string;
  balance: number;
  currency: string;
  lastTopUpAt: Date | null;
  autoRechargeEnabled: boolean;
  autoRechargeThreshold: number;
  autoRechargeAmount: number;
}

export interface WalletDebitResult {
  subscriberId: string;
  previousBalance: number;
  debitedAmount: number;
  newBalance: number;
  sufficient: boolean;
  suspended: boolean;
  transactionRef: string;
}

/**
 * Read the prepaid wallet for a subscriber. Wallet state is stored in the
 * subscriber's `metadata` JSON (no schema migration needed) as:
 *   { wallet: { balance, currency, autoRecharge: {...} } }
 */
export async function getWallet(
  tenantId: string,
  subscriberId: string
): Promise<PrepaidWallet> {
  const sub = await db.subscriber.findFirst({
    where: { id: subscriberId, tenantId },
    select: { customerId: true, metadata: true },
  });
  if (!sub) throw new Error("Subscriber not found");

  const meta = parseMetadata(sub.metadata);
  const wallet = meta.wallet ?? { balance: 0, currency: "USD", autoRecharge: { enabled: false, threshold: 0, amount: 0 }, lastTopUpAt: null };

  return {
    subscriberId,
    customerId: sub.customerId,
    balance: round2(wallet.balance ?? 0),
    currency: wallet.currency ?? "USD",
    lastTopUpAt: wallet.lastTopUpAt ?? null,
    autoRechargeEnabled: wallet.autoRecharge?.enabled ?? false,
    autoRechargeThreshold: wallet.autoRecharge?.threshold ?? 0,
    autoRechargeAmount: wallet.autoRecharge?.amount ?? 0,
  };
}

/**
 * Top-up (credit) a prepaid wallet. Creates a Payment record + ActionHistory.
 */
export async function topUpWallet(
  tenantId: string,
  subscriberId: string,
  amount: number,
  method: string,
  actorUserId: string,
  options?: { autoRecharge?: boolean }
): Promise<PrepaidWallet> {
  const sub = await db.subscriber.findFirst({
    where: { id: subscriberId, tenantId },
    select: { id: true, customerId: true, metadata: true },
  });
  if (!sub) throw new Error("Subscriber not found");

  const meta = parseMetadata(sub.metadata);
  const wallet = meta.wallet ?? { balance: 0, currency: "USD", autoRecharge: { enabled: false, threshold: 0, amount: 0 } };
  wallet.balance = round2((wallet.balance ?? 0) + amount);
  wallet.lastTopUpAt = new Date().toISOString();
  if (options?.autoRecharge) {
    wallet.autoRecharge = {
      enabled: true,
      threshold: wallet.autoRecharge?.threshold ?? 10,
      amount: wallet.autoRecharge?.amount ?? 50,
    };
  }
  meta.wallet = wallet;
  await db.subscriber.update({
    where: { id: subscriberId },
    data: { metadata: JSON.stringify(meta) },
  });

  // Record the top-up as a Payment (no invoice linkage — wallet credit)
  await db.payment.create({
    data: {
      tenantId,
      number: `PMT-${Date.now()}`,
      invoiceId: null,
      subscriberId,
      amount: new Prisma.Decimal(amount),
      currency: wallet.currency ?? "USD",
      method,
      status: "completed",
      notes: `Prepaid wallet top-up${options?.autoRecharge ? " (auto-recharge enabled)" : ""}`,
      reconciled: false,
    },
  });

  await db.actionHistory.create({
    data: {
      tenantId,
      subscriberId,
      action: "wallet_topup",
      notes: `Wallet topped up ${amount} ${wallet.currency} via ${method}`,
      performedBy: actorUserId,
    },
  });

  return getWallet(tenantId, subscriberId);
}

/**
 * Debit the prepaid wallet for a charge (e.g. monthly subscription, top-up plan).
 * If the balance is insufficient AND auto-recharge is enabled, trigger a top-up
 * first. If still insufficient after auto-recharge (or no auto-recharge), suspend
 * the subscriber and return suspended=true.
 */
export async function debitWallet(
  tenantId: string,
  subscriberId: string,
  amount: number,
  description: string,
  actorUserId: string
): Promise<WalletDebitResult> {
  const wallet = await getWallet(tenantId, subscriberId);
  const previousBalance = wallet.balance;

  // Auto-recharge if enabled and below threshold
  if (
    wallet.autoRechargeEnabled &&
    previousBalance < wallet.autoRechargeThreshold
  ) {
    await topUpWallet(tenantId, subscriberId, wallet.autoRechargeAmount, "gateway", actorUserId, { autoRecharge: true });
  }

  const refreshed = await getWallet(tenantId, subscriberId);
  const sufficient = refreshed.balance >= amount;
  const transactionRef = `WAL-${Date.now()}`;

  if (!sufficient) {
    // Suspend the subscriber — prepaid cannot go negative
    const { transitionSubscriberStatus } = await import(
      "@/core/repositories/subscriber"
    );
    try {
      await transitionSubscriberStatus(
        tenantId,
        subscriberId,
        "suspended" as any,
        actorUserId
      );
    } catch {
      // non-fatal
    }

    await db.actionHistory.create({
      data: {
        tenantId,
        subscriberId,
        action: "wallet_debit_failed",
        notes: `Wallet debit of ${amount} failed (balance ${refreshed.balance}) — subscriber auto-suspended. Ref ${transactionRef}`,
        performedBy: actorUserId,
      },
    });

    return {
      subscriberId,
      previousBalance,
      debitedAmount: 0,
      newBalance: refreshed.balance,
      sufficient: false,
      suspended: true,
      transactionRef,
    };
  }

  // Debit
  const newBalance = round2(refreshed.balance - amount);
  await updateWalletBalance(tenantId, subscriberId, newBalance);

  await db.actionHistory.create({
    data: {
      tenantId,
      subscriberId,
      action: "wallet_debit",
      notes: `Wallet debited ${amount} for: ${description}. Ref ${transactionRef}`,
      performedBy: actorUserId,
    },
  });

  return {
    subscriberId,
    previousBalance,
    debitedAmount: amount,
    newBalance,
    sufficient: true,
    suspended: false,
    transactionRef,
  };
}

/**
 * Bulk-process prepaid deductions for all active subscribers with prepaid
 * wallets — called by the nightly billing scheduler.
 */
export async function processPrepaidDeductions(
  tenantId: string,
  actorUserId: string
): Promise<{
  processed: number;
  debited: number;
  autoRecharged: number;
  suspended: number;
  errors: string[];
}> {
  const subscribers = await db.subscriber.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, planId: true },
  });

  let debited = 0;
  let autoRecharged = 0;
  let suspended = 0;
  const errors: string[] = [];

  for (const sub of subscribers) {
    try {
      const wallet = await getWallet(tenantId, sub.id);
      // Only process subscribers whose wallet has been initialized (balance > 0 at some point)
      if (wallet.lastTopUpAt === null) continue;

      if (!sub.planId) continue;
      const plan = await db.plan.findFirst({
        where: { id: sub.planId },
        select: { price: true, name: true },
      });
      if (!plan) continue;

      const result = await debitWallet(
        tenantId,
        sub.id,
        plan.price.toNumber(),
        `${plan.name} — monthly subscription`,
        actorUserId
      );

      if (result.sufficient) debited++;
      else suspended++;
    } catch (err) {
      errors.push(
        `Subscriber ${sub.id}: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  return {
    processed: subscribers.length,
    debited,
    autoRecharged,
    suspended,
    errors,
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function parseMetadata(metadata: string | null): Record<string, any> {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

async function updateWalletBalance(
  tenantId: string,
  subscriberId: string,
  newBalance: number
): Promise<void> {
  const sub = await db.subscriber.findFirst({
    where: { id: subscriberId, tenantId },
    select: { metadata: true },
  });
  const meta = parseMetadata(sub?.metadata ?? null);
  if (meta.wallet) {
    meta.wallet.balance = newBalance;
  } else {
    meta.wallet = { balance: newBalance, currency: "USD" };
  }
  await db.subscriber.update({
    where: { id: subscriberId },
    data: { metadata: JSON.stringify(meta) },
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
