// =====================================================================
// RBAC — Permission helpers
// Backend-enforced. Frontend only reflects/hides; never trusts it.
// =====================================================================

import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/core/auth/nextauth";
import { ApiError, ErrorCode } from "@/core/api/errors";
import { MODULE_MAP } from "@/core/modules/catalog";
import { isModuleEnabled } from "@/core/modules/resolver";

export interface AuthContext {
  userId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roles: string[];
  permissions: Set<string>;
  requestId?: string;
}

/**
 * Returns the authenticated user context or throws ApiError.unauthenticated.
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw ApiError.unauthenticated();
  }
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    tenantName: session.user.tenantName,
    tenantSlug: session.user.tenantSlug,
    roles: session.user.roles,
    permissions: new Set(session.user.permissions),
  };
}

/**
 * Returns the auth context if logged in, or null (for public endpoints).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    tenantName: session.user.tenantName,
    tenantSlug: session.user.tenantSlug,
    roles: session.user.roles,
    permissions: new Set(session.user.permissions),
  };
}

/**
 * Require a specific permission. Throws 403 if missing.
 */
export async function requirePermission(permission: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.permissions.has(permission) && !ctx.permissions.has("*")) {
    throw ApiError.forbidden(permission);
  }
  return ctx;
}

/**
 * Require that a module is enabled for the tenant. Throws 403 if not.
 */
export async function requireModule(moduleId: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  const mod = MODULE_MAP[moduleId];
  if (!mod) {
    throw ApiError.internal(`Unknown module: ${moduleId}`);
  }
  if (mod.coreModule) return ctx;
  const enabled = await isModuleEnabled(ctx.tenantId, moduleId);
  if (!enabled) {
    throw ApiError.moduleDisabled(moduleId);
  }
  return ctx;
}

/**
 * Require both authentication AND a specific module AND a permission.
 * Use this as the standard guard at the top of any module-scoped handler.
 */
export async function requireModulePermission(
  moduleId: string,
  permission: string
): Promise<AuthContext> {
  const ctx = await requireModule(moduleId);
  if (!ctx.permissions.has(permission) && !ctx.permissions.has("*")) {
    throw ApiError.forbidden(permission);
  }
  return ctx;
}

/**
 * For server components / pages — redirect to login if not authenticated.
 */
export async function requireAuthOrRedirect(redirectTo = "/login") {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(redirectTo);
  }
  return session;
}

/**
 * Check if a permission is present (non-throwing).
 */
export function can(ctx: AuthContext | null, permission: string): boolean {
  if (!ctx) return false;
  return ctx.permissions.has(permission) || ctx.permissions.has("*");
}

export { ErrorCode };
