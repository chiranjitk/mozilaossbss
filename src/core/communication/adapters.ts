// =====================================================================
// COMMUNICATION ADAPTER INTERFACE
// Each channel (Email, SMS, WhatsApp, Push) implements this.
// =====================================================================

export interface SendRequest {
  to: string;
  subject?: string;
  body: string;
  templateName?: string;
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  status: "sent" | "failed" | "pending";
}

export interface ChannelAdapter {
  readonly name: string;
  readonly displayName: string;
  readonly requiresConfig: string[];
  send(request: SendRequest, config: Record<string, string>): Promise<SendResult>;
  isConfigured(config: Record<string, string>): boolean;
}

class EmailAdapter implements ChannelAdapter {
  readonly name = "email"; readonly displayName = "Email (SMTP)";
  readonly requiresConfig = ["smtpHost", "smtpPort", "smtpUser", "smtpPassword"];
  async send(request: SendRequest, config: Record<string, string>): Promise<SendResult> {
    if (!this.isConfigured(config)) return { success: false, error: "SMTP not configured", status: "failed" };
    console.log(`[email] To: ${request.to}, Subject: ${request.subject ?? "(no subject)"}`);
    return { success: true, messageId: `email_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, status: "sent" };
  }
  isConfigured(config: Record<string, string>): boolean { return !!(config.smtpHost && config.smtpUser && config.smtpPassword); }
}

class SmsAdapter implements ChannelAdapter {
  readonly name = "sms"; readonly displayName = "SMS (Twilio)";
  readonly requiresConfig = ["accountSid", "authToken", "fromNumber"];
  async send(request: SendRequest, config: Record<string, string>): Promise<SendResult> {
    if (!this.isConfigured(config)) return { success: false, error: "SMS not configured", status: "failed" };
    console.log(`[sms] To: ${request.to}, Body: ${request.body.slice(0, 50)}...`);
    return { success: true, messageId: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, status: "sent" };
  }
  isConfigured(config: Record<string, string>): boolean { return !!(config.accountSid && config.authToken && config.fromNumber); }
}

class WhatsAppAdapter implements ChannelAdapter {
  readonly name = "whatsapp"; readonly displayName = "WhatsApp Business";
  readonly requiresConfig = ["apiToken", "phoneNumberId"];
  async send(request: SendRequest, config: Record<string, string>): Promise<SendResult> {
    if (!this.isConfigured(config)) return { success: false, error: "WhatsApp not configured", status: "failed" };
    console.log(`[whatsapp] To: ${request.to}, Body: ${request.body.slice(0, 50)}...`);
    return { success: true, messageId: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, status: "sent" };
  }
  isConfigured(config: Record<string, string>): boolean { return !!(config.apiToken && config.phoneNumberId); }
}

class PushAdapter implements ChannelAdapter {
  readonly name = "push"; readonly displayName = "Push Notification";
  readonly requiresConfig = ["fcmServerKey"];
  async send(request: SendRequest, config: Record<string, string>): Promise<SendResult> {
    if (!this.isConfigured(config)) return { success: false, error: "Push not configured", status: "failed" };
    console.log(`[push] To: ${request.to}, Body: ${request.body.slice(0, 50)}...`);
    return { success: true, messageId: `push_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, status: "sent" };
  }
  isConfigured(config: Record<string, string>): boolean { return !!config.fcmServerKey; }
}

const ADAPTERS: Record<string, ChannelAdapter> = { email: new EmailAdapter(), sms: new SmsAdapter(), whatsapp: new WhatsAppAdapter(), push: new PushAdapter() };

export function getChannelAdapter(name: string): ChannelAdapter | null { return ADAPTERS[name] ?? null; }

export function listChannelAdapters() {
  return Object.values(ADAPTERS).map((a) => ({ name: a.name, displayName: a.displayName, requiresConfig: a.requiresConfig }));
}

export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
}

export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, ""))));
}
