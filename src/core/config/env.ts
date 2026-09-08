// =====================================================================
// ENVIRONMENT CONFIGURATION
// All env access centralized. Never read process.env directly elsewhere.
// =====================================================================

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default("file:/home/z/my-project/db/custom.db"),
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().default("cryptsk-dev-secret-change-me-in-production-32chars"),

  // RADIUS / AAA
  RADIUS_AUTH_PORT: z.coerce.number().default(1812),
  RADIUS_ACCT_PORT: z.coerce.number().default(1813),
  RADIUS_COA_PORT: z.coerce.number().default(3799),
  RADIUS_WORKER_ENABLED: z.coerce.boolean().default(false),

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),

  // AI (optional)
  ZAI_API_KEY: z.string().optional(),

  // Communication providers (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  // Payment gateways (optional)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.flatten());
    // In dev we want to see this. In prod we still start (best effort).
    if (process.env.NODE_ENV === "production") {
      return process.env as unknown as Env;
    }
  }
  return result.success ? result.data : (process.env as unknown as Env);
}

export const env = loadEnv();

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
