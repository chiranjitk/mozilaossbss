// =====================================================================
// API KEY DETAIL — DELETE (revoke) only
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

// DELETE /api/v1/api-keys/[id] — revoke (soft delete: status → revoked)
export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.update");
  const id = new URL(req.url).pathname.split("/")[4];

  const existing = await db.apiKey.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    throw ApiError.notFound("ApiKey", id);
  }

  const updated = await db.apiKey.update({
    where: { id },
    data: { status: "revoked" },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "api_key.revoke",
    module: "core",
    resource: "ApiKey",
    resourceId: id,
    requestId,
    oldValue: { name: existing.name, status: existing.status },
    newValue: { status: "revoked" },
    message: `Revoked API key "${updated.name}"`,
  });

  return ok({ id: updated.id, status: "revoked" });
});
