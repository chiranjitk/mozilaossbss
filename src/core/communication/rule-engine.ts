// =====================================================================
// NOTIFICATION RULE ENGINE — listens to events and sends notifications
// This runs as part of the application and processes events in real-time.
// When an event fires (subscriber.created, invoice.paid, etc.),
// matching notification rules are triggered.
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { eventBus } from "@/core/events/bus";
import { getChannelAdapter, renderTemplate } from "@/core/communication/adapters";
import { logger } from "@/core/logging/logger";

let initialized = false;

/**
 * Initialize the notification rule engine.
 * Subscribes to all platform events and checks for matching notification rules.
 * This is called once on application startup.
 */
export function initNotificationEngine(): void {
  if (initialized) return;
  initialized = true;

  // Subscribe to ALL events via wildcard
  eventBus.onAny(async (event) => {
    try {
      await processEventForNotifications(event);
    } catch (err) {
      // Never let notification errors break the event bus
      logger.error("Notification rule engine error", { module: "notifications", error: err });
    }
  });

  logger.info("Notification rule engine initialized", { module: "notifications" });
}

/**
 * Process an event against notification rules.
 * Finds all enabled rules matching the event type and sends notifications.
 */
async function processEventForNotifications(event: {
  type: string;
  payload: any;
  tenantId?: string;
}): Promise<void> {
  if (!event.tenantId) return;

  // Find matching notification rules
  const rules = await db.notificationRule.findMany({
    where: {
      tenantId: event.tenantId,
      event: event.type,
      enabled: true,
    },
    include: {
      template: true,
    },
  });

  if (rules.length === 0) return;

  for (const rule of rules) {
    try {
      // Check delay (if delayMinutes > 0, schedule for later — in production this would use a job queue)
      if (rule.delayMinutes > 0) {
        // For now, we process immediately but log the intended delay
        logger.debug(`Notification rule ${rule.name} has ${rule.delayMinutes}min delay (processing immediately in dev)`, { module: "notifications" });
      }

      // Render template with event payload as variables
      const template = rule.template;
      if (!template) continue;

      // Build variables from event payload
      const variables: Record<string, string> = {};
      for (const [key, value] of Object.entries(event.payload || {})) {
        variables[key] = String(value);
      }

      const renderedBody = renderTemplate(template.body, variables);
      const renderedSubject = template.subject
        ? renderTemplate(template.subject, variables)
        : undefined;

      // Determine recipient
      let recipient = "";
      if (rule.recipient === "subscriber" && event.payload.subscriberId) {
        const sub = await db.subscriber.findFirst({
          where: { id: event.payload.subscriberId },
          select: { email: true, phone: true },
        });
        recipient = rule.channel === "email" ? (sub?.email ?? "") : (sub?.phone ?? "");
      } else if (rule.recipient === "admin") {
        const admin = await db.user.findFirst({
          where: { tenantId: event.tenantId, status: "active" },
          select: { email: true },
        });
        recipient = admin?.email ?? "";
      } else if (rule.recipient === "custom" && rule.customRecipient) {
        recipient = rule.customRecipient;
      }

      if (!recipient) {
        logger.warn(`Notification rule ${rule.name}: no recipient found`, { module: "notifications", event: event.type });
        continue;
      }

      // Send via channel adapter
      const adapter = getChannelAdapter(rule.channel);
      if (!adapter) {
        logger.warn(`Notification rule ${rule.name}: unknown channel ${rule.channel}`, { module: "notifications" });
        continue;
      }

      // Check if adapter is configured (for now, all adapters have simulated send)
      const result = await adapter.send(
        { to: recipient, subject: renderedSubject, body: renderedBody, templateName: template.name },
        {} // Config would come from SystemSetting
      );

      // Log the communication
      await db.communicationLog.create({
        data: {
          tenantId: event.tenantId!,
          templateId: template.id,
          ruleId: rule.id,
          channel: rule.channel,
          recipient,
          subject: renderedSubject,
          body: renderedBody,
          status: result.success ? "sent" : "failed",
          error: result.error,
          sentAt: result.success ? new Date() : null,
        },
      });

      if (result.success) {
        logger.info(`Notification sent: ${rule.name} → ${recipient} (${rule.channel})`, { module: "notifications" });
      } else {
        logger.warn(`Notification failed: ${rule.name} → ${recipient}: ${result.error}`, { module: "notifications" });
      }
    } catch (err) {
      logger.error(`Notification rule ${rule.name} processing error`, { module: "notifications", error: err });
    }
  }
}
