// =====================================================================
// STRUCTURED LOGGER
// Central logging with levels, module context, request IDs.
// Never logs secrets. In dev: pretty console. In prod: structured JSON.
// =====================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogContext {
  module?: string;
  requestId?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

// Keys that must never be logged
const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "secret",
  "sharedSecret",
  "apiKey",
  "apiSecret",
  "token",
  "accessToken",
  "refreshToken",
  "stripeKey",
  "razorpayKey",
  "smtpPassword",
]);

function redact(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key)) {
      out[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      out[key] = redact(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

class Logger {
  private log(level: LogLevel, message: string, context: LogContext = {}, error?: unknown): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...redact(context),
      ...(error instanceof Error
        ? { error: error.message, stack: error.stack }
        : error
          ? { error: String(error) }
          : {}),
    };

    if (process.env.NODE_ENV === "production") {
      // Structured JSON for prod log aggregation
      process.stdout.write(JSON.stringify(entry) + "\n");
    } else {
      // Pretty console for dev
      const prefix = `\x1b[${this.color(level)}m[${level.toUpperCase()}]\x1b[0m`;
      const modTag = context.module ? ` \x1b[2m(${context.module})\x1b[0m` : "";
      const req = context.requestId ? ` \x1b[2m${context.requestId}\x1b[0m` : "";
      process.stdout.write(`${prefix}${modTag}${req} ${message}\n`);
      if (error) {
        process.stdout.write(`  └─ ${entry.error}\n`);
      }
    }
  }

  private color(level: LogLevel): string {
    switch (level) {
      case "debug": return "90";
      case "info": return "36";
      case "warn": return "33";
      case "error": return "31";
      case "fatal": return "35";
    }
  }

  debug(message: string, context?: LogContext) { this.log("debug", message, context); }
  info(message: string, context?: LogContext) { this.log("info", message, context); }
  warn(message: string, context?: LogContext, error?: unknown) { this.log("warn", message, context, error); }
  error(message: string, context?: LogContext, error?: unknown) { this.log("error", message, context, error); }
  fatal(message: string, context?: LogContext, error?: unknown) { this.log("fatal", message, context, error); }

  /** Create a child logger with persistent context (e.g. for a module) */
  child(context: LogContext): Logger {
    return {
      debug: (m: string, c?: LogContext) => this.log("debug", m, { ...context, ...c }),
      info: (m: string, c?: LogContext) => this.log("info", m, { ...context, ...c }),
      warn: (m: string, c?: LogContext, e?: unknown) => this.log("warn", m, { ...context, ...c }, e),
      error: (m: string, c?: LogContext, e?: unknown) => this.log("error", m, { ...context, ...c }, e),
      fatal: (m: string, c?: LogContext, e?: unknown) => this.log("fatal", m, { ...context, ...c }, e),
      child: (c: LogContext) => this.child({ ...context, ...c }),
    } as Logger;
  }
}

export const logger = new Logger();
