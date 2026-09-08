// =====================================================================
// API KEYS API — list, create (with key generation)
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

/**
 * Generate a key in format: cryp_live_<32hex>. Returned ONCE on creation.
 * Only a hashed version (sha256) is stored in DB.
 */
function generateApiKey(): { plaintext: string; hashed: string } {
  const hex = randomBytes(24).toString("hex");
  const plaintext = `cryp_live_${hex}`;
  const hashed = hashKey(plaintext);
  return { plaintext, hashed };
}

function hashKey(key: string): string {
  // Simple sha256 hash via node crypto (Web Crypto requires async)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(key).digest("hex");
}

// GET /api/v1/api-keys
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");

  const where = {
    tenantId: ctx.tenantId,
    ...(status && status !== "all" ? { status } : {}),
    ...(search
      ? {
          OR: [{ name: { contains: search } }, { createdBy: { contains: search } }],
        }
      : {}),
  };

  const [keys, total] = await Promise.all([
    db.apiKey.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.apiKey.count({ where }),
  ]);

  // NEVER return the key plaintext or hash. Only metadata + masked prefix.
  return paginated(
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyMasked: maskKey(k.key),
      permissions: k.permissions,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      status: k.status,
      createdBy: k.createdBy,
      createdAt: k.createdAt,
    })),
    { page, pageSize, total },
    requestId
  );
});

function maskKey(hashedOrPlain: string): string {
  // If key was stored as plaintext (legacy/seed), mask the middle. Else show prefix only.
  if (hashedOrPlain.startsWith("cryp_")) {
    return hashedOrPlain.slice(0, 12) + "•".repeat(20) + hashedOrPlain.slice(-4);
  }
  return `cryp_live_••••••••••••••••`;
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  permissions: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional().or(z.literal("")).or(z.null()),
});

// POST /api/v1/api-keys — creates a new key, returns plaintext ONCE
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("core", "system.settings.update");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }
  const data = parsed.data;

  const { plaintext, hashed } = generateApiKey();

  const apiKey = await db.apiKey.create({
    data: {
      tenantId: ctx.tenantId,
      name: data.name,
      key: hashed,
      permissions: data.permissions ? JSON.stringify(data.permissions) : null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      status: "active",
      createdBy: ctx.userId,
    },
  });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "api_key.create",
    module: "core",
    resource: "ApiKey",
    resourceId: apiKey.id,
    requestId,
    newValue: {
      name: apiKey.name,
      permissions: apiKey.permissions,
      expiresAt: apiKey.expiresAt,
    },
    message: `Created API key "${apiKey.name}"`,
  });

  return created(
    {
      id: apiKey.id,
      name: apiKey.name,
      key: plaintext, // returned ONLY on creation
      permissions: apiKey.permissions,
      expiresAt: apiKey.expiresAt,
      status: apiKey.status,
      message: "Save this key securely — you will not be able to see it again.",
    },
    requestId
  );
});
