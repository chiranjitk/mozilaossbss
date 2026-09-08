// =====================================================================
// API KEY AUTH MIDDLEWARE — validates API keys for external access
// Used by external systems (billing integrations, monitoring, etc.)
// =====================================================================

import "server-only";
import { db } from "@/lib/db";
import { createHash } from "crypto";

export interface ApiKeyContext {
  valid: boolean;
  keyId?: string;
  keyName?: string;
  tenantId?: string;
  permissions?: string[];
  error?: string;
}

/**
 * Validate an API key from the X-API-Key header.
 * Returns context with tenant + permissions if valid.
 * Updates lastUsedAt on each use.
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyContext> {
  if (!apiKey || apiKey.length < 10) {
    return { valid: false, error: "Missing or invalid API key" };
  }

  // Hash the key for lookup (keys are stored as SHA-256 hashes)
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  const keyRecord = await db.apiKey.findFirst({
    where: {
      key: apiKey, // We store the raw key (in production, store hash)
      status: "active",
    },
    include: {
      tenant: { select: { id: true, name: true, status: true } },
    },
  });

  if (!keyRecord) {
    return { valid: false, error: "API key not found" };
  }

  // Check expiry
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return { valid: false, error: "API key has expired" };
  }

  // Check tenant status
  if (keyRecord.tenant.status !== "active") {
    return { valid: false, error: "Tenant is not active" };
  }

  // Update last used
  await db.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  // Parse permissions
  const permissions = keyRecord.permissions
    ? JSON.parse(keyRecord.permissions)
    : ["*"]; // No restrictions = all permissions

  return {
    valid: true,
    keyId: keyRecord.id,
    keyName: keyRecord.name,
    tenantId: keyRecord.tenantId,
    permissions,
  };
}

/**
 * Check if an API key has a specific permission.
 * Wildcard "*" matches everything.
 */
export function hasApiKeyPermission(ctx: ApiKeyContext, permission: string): boolean {
  if (!ctx.valid || !ctx.permissions) return false;
  return ctx.permissions.includes("*") || ctx.permissions.includes(permission);
}
