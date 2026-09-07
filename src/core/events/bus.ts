// =====================================================================
// INTERNAL EVENT BUS
// Modules communicate through events; no direct cross-module imports.
// Synchronous in-process for now; designed for future extraction to
// a Redis/NATS-backed bus without changing consumer code.
// =====================================================================

import type { Prisma } from "@prisma/client";

export type EventPayload = Record<string, unknown>;

export interface CryptskEvent<T extends EventPayload = EventPayload> {
  type: string;
  payload: T;
  tenantId?: string;
  source?: string;
  requestId?: string;
  timestamp: Date;
}

type EventHandler<T extends EventPayload = EventPayload> = (
  event: CryptskEvent<T>
) => void | Promise<void>;

class EventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();
  private wildcardHandlers = new Set<EventHandler<any>>();

  /** Subscribe to a specific event type */
  on<T extends EventPayload = EventPayload>(
    type: string,
    handler: EventHandler<T>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);
    return () => this.off(type, handler);
  }

  /** Subscribe to all events (for audit, logging) */
  onAny(handler: EventHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => this.wildcardHandlers.delete(handler);
  }

  off<T extends EventPayload = EventPayload>(
    type: string,
    handler: EventHandler<T>
  ): void {
    this.handlers.get(type)?.delete(handler as EventHandler);
  }

  /** Emit an event synchronously to all handlers */
  async emit<T extends EventPayload = EventPayload>(
    type: string,
    payload: T,
    meta?: { tenantId?: string; source?: string; requestId?: string }
  ): Promise<void> {
    const event: CryptskEvent<T> = {
      type,
      payload,
      tenantId: meta?.tenantId,
      source: meta?.source,
      requestId: meta?.requestId,
      timestamp: new Date(),
    };

    // Persist to EventLog for replay/audit (fire-and-forget, errors swallowed)
    void persistEvent(event).catch(() => {
      // Swallow — event bus must never block the caller
    });

    const handlers = this.handlers.get(type);
    const promises: Promise<void>[] = [];

    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(event);
          if (result instanceof Promise) promises.push(result);
        } catch {
          // Handler errors must not crash the bus
        }
      }
    }

    for (const handler of this.wildcardHandlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) promises.push(result);
      } catch {
        // Same as above
      }
    }

    await Promise.allSettled(promises);
  }
}

async function persistEvent(event: CryptskEvent): Promise<void> {
  // Lazy import to avoid circular dependency at module load time
  const { db } = await import("@/lib/db");
  await db.eventLog.create({
    data: {
      tenantId: event.tenantId ?? null,
      type: event.type,
      payload: JSON.stringify(event.payload) as unknown as Prisma.InputJsonValue,
      source: event.source ?? null,
      requestId: event.requestId ?? null,
      processed: true,
      processedAt: new Date(),
    },
  });
}

// Singleton bus
export const eventBus = new EventBus();

// =====================================================================
// CANONICAL EVENT TYPES — declared once, used everywhere
// =====================================================================
export const EVENTS = {
  // Subscriber lifecycle
  SUBSCRIBER_CREATED: "subscriber.created",
  SUBSCRIBER_UPDATED: "subscriber.updated",
  SUBSCRIBER_SUSPENDED: "subscriber.suspended",
  SUBSCRIBER_REACTIVATED: "subscriber.reactivated",
  SUBSCRIBER_TERMINATED: "subscriber.terminated",

  // Plan
  PLAN_CREATED: "plan.created",
  PLAN_UPDATED: "plan.updated",
  PLAN_PRICING_CHANGED: "plan.pricing_changed",

  // AAA / Sessions
  SESSION_STARTED: "session.started",
  SESSION_STOPPED: "session.stopped",
  SESSION_INTERIM_UPDATE: "session.interim_update",
  SESSION_COA: "session.coa",
  SESSION_DISCONNECTED: "session.disconnected",
  AUTH_SUCCESS: "auth.success",
  AUTH_FAILURE: "auth.failure",

  // Billing
  INVOICE_CREATED: "invoice.created",
  INVOICE_OVERDUE: "invoice.overdue",
  INVOICE_PAID: "invoice.paid",
  INVOICE_CANCELLED: "invoice.cancelled",
  BILLING_RUN_COMPLETED: "billing.run_completed",

  // Payments
  PAYMENT_RECEIVED: "payment.received",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_REFUNDED: "payment.refunded",

  // Network
  NAS_ONLINE: "nas.online",
  NAS_OFFLINE: "nas.offline",

  // Monitoring
  ALERT_TRIGGERED: "alert.triggered",
  ALERT_ACKNOWLEDGED: "alert.acknowledged",
  BANDWIDTH_THRESHOLD_EXCEEDED: "bandwidth.threshold_exceeded",

  // Operations
  COMPLAINT_CREATED: "complaint.created",
  COMPLAINT_RESOLVED: "complaint.resolved",
  INSTALLATION_COMPLETED: "installation.completed",

  // System
  MODULE_ENABLED: "module.enabled",
  MODULE_DISABLED: "module.disabled",
  USER_CREATED: "user.created",
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  SETTING_CHANGED: "setting.changed",
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];
