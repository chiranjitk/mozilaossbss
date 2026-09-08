// =====================================================================
// BACKUPS API — list, create (trigger backup)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

// GET /api/v1/backups
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(type && type !== "all" ? { type } : {}),
  };

  const [backups, total] = await Promise.all([
    db.backup.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.backup.count({ where }),
  ]);

  return paginated(
    backups.map((b) => ({
      id: b.id,
      type: b.type,
      status: b.status,
      size: b.size,
      path: b.path,
      checksum: b.checksum,
      encrypted: b.encrypted,
      createdBy: b.createdBy,
      createdAt: b.createdAt,
      completedAt: b.completedAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

const createSchema = z.object({
  type: z.enum(["database", "config", "full"]).default("database"),
  encrypted: z.boolean().default(true),
});

/**
 * POST /api/v1/backups — trigger a backup.
 *
 * In this sandbox we cannot perform a real full DB dump safely, but the
 * endpoint simulates a backup job by recording the row, computing a
 * checksum of a small representative payload (table counts), and marking
 * the backup as completed.
 *
 * In production this would dispatch to a worker.
 */
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.update");
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  // Compute "size" from row counts as a proxy for DB size
  const counts = await Promise.all([
    db.subscriber.count({ where: { tenantId: ctx.tenantId } }),
    db.invoice.count({ where: { tenantId: ctx.tenantId } }),
    db.payment.count({ where: { tenantId: ctx.tenantId } }),
    db.activeSession.count({ where: { tenantId: ctx.tenantId } }),
    db.auditLog.count({ where: { tenantId: ctx.tenantId } }),
  ]);
  const totalRows = counts.reduce((s, n) => s + n, 0);
  // Rough estimate: 1KB per row
  const sizeBytes = Math.max(1024, totalRows * 1024);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `backups/${ctx.tenantSlug}/cryptsk-${data.type}-${timestamp}.bak`;
  const checksum = createHash("sha256")
    .update(`${ctx.tenantId}:${timestamp}:${totalRows}`)
    .digest("hex");

  const now = new Date();
  const backup = await db.backup.create({
    data: {
      tenantId: ctx.tenantId,
      type: data.type,
      status: "completed",
      size: sizeBytes,
      path,
      checksum,
      encrypted: data.encrypted,
      createdBy: ctx.userId,
      createdAt: now,
      completedAt: now,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "backup.create",
    module: "core",
    resource: "Backup",
    resourceId: backup.id,
    requestId,
    newValue: {
      type: backup.type,
      path: backup.path,
      size: backup.size,
      encrypted: backup.encrypted,
    },
    message: `Triggered ${backup.type} backup (${formatBytes(backup.size ?? 0)})`,
  });

  return created(
    {
      id: backup.id,
      type: backup.type,
      status: backup.status,
      size: backup.size,
      path: backup.path,
      checksum: backup.checksum,
      encrypted: backup.encrypted,
      completedAt: backup.completedAt,
    },
    requestId
  );
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
