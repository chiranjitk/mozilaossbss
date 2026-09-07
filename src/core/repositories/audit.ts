// =====================================================================
// AUDIT LOG HELPER
// Every sensitive action is recorded with full context.
// =====================================================================

import { db } from "@/lib/db";

export interface AuditEntry {
  tenantId?: string;
  userId?: string;
  action: string; // e.g. "subscriber.suspend"
  module: string; // e.g. "subscribers"
  resource: string; // e.g. "Subscriber"
  resourceId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  oldValue?: unknown;
  newValue?: unknown;
  status?: "success" | "failure" | "error";
  message?: string;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: entry.tenantId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        module: entry.module,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        requestId: entry.requestId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        oldValue: entry.oldValue ? JSON.stringify(entry.oldValue) : null,
        newValue: entry.newValue ? JSON.stringify(entry.newValue) : null,
        status: entry.status ?? "success",
        message: entry.message ?? null,
      },
    });
  } catch (err) {
    // Audit failure must NEVER break the user flow
    console.error("[audit] Failed to record audit entry:", err);
  }
}
