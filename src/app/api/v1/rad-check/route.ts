// =====================================================================
// RADCHECK API — FreeRADIUS native radcheck table
// username + attribute + op + value (check items used during authentication)
// GET list + POST create. Read = aaa.session.read, Write = aaa.radius.configure
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

const OP_VALUES = ["==", ":=", "=", "!=", "<=", ">=", "<", ">", "=~", "!~", "=*", "!*"];

// GET /api/v1/rad-check
export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  await requireModulePermission("aaa", "aaa.session.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const username = url.searchParams.get("username");

  const where = {
    ...(username ? { username } : {}),
    ...(search
      ? {
          OR: [
            { username: { contains: search } },
            { attribute: { contains: search } },
            { value: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.radCheck.findMany({
      where,
      orderBy: [{ username: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.radCheck.count({ where }),
  ]);

  return paginated(rows, { page, pageSize, total }, requestId);
});

const createSchema = z.object({
  username: z.string().min(1, "username required"),
  attribute: z.string().min(1, "attribute required"),
  op: z.enum(OP_VALUES as [string, ...string[]]).default(":="),
  value: z.string().min(1, "value required"),
});

// POST /api/v1/rad-check
export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("aaa", "aaa.radius.configure");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  const createdRow = await db.radCheck.create({ data: parsed.data });

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "radcheck.create",
    module: "aaa",
    resource: "RadCheck",
    resourceId: String(createdRow.id),
    requestId,
    newValue: parsed.data,
    message: `Created radcheck for ${createdRow.username}: ${createdRow.attribute} ${createdRow.op} ${createdRow.value}`,
  });

  return created(createdRow, requestId);
});
