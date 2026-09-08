// =====================================================================
// BACKUP DETAIL API — GET only
// =====================================================================

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";

export const dynamic = "force-dynamic";

// GET /api/v1/backups/[id]
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.read");
  const id = new URL(req.url).pathname.split("/")[4];

  const backup = await db.backup.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!backup) {
    throw ApiError.notFound("Backup", id);
  }

  return ok({
    id: backup.id,
    type: backup.type,
    status: backup.status,
    size: backup.size,
    path: backup.path,
    checksum: backup.checksum,
    encrypted: backup.encrypted,
    createdBy: backup.createdBy,
    createdAt: backup.createdAt,
    completedAt: backup.completedAt,
  });
});
