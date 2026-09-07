// =====================================================================
// FIREWALL RULES API — list + create
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, created, paginated, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { parsePagination } from "@/core/repositories/base";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.firewall.read");
  const url = new URL(req.url);
  const { page, pageSize } = parsePagination(url.searchParams);
  const search = url.searchParams.get("search");
  const action = url.searchParams.get("action");
  const chain = url.searchParams.get("chain");
  const where = {
    tenantId: ctx.tenantId,
    ...(action && action !== "all" ? { action } : {}),
    ...(chain && chain !== "all" ? { chain } : {}),
    ...(search ? { name: { contains: search } } : {}),
  };
  const [rules, total] = await Promise.all([
    db.firewallRule.findMany({ where, orderBy: [{ priority: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.firewallRule.count({ where }),
  ]);
  return paginated(rules, { page, pageSize, total }, requestId);
});

const createSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  action: z.enum(["accept", "drop", "reject", "masquerade"]).default("accept"),
  chain: z.enum(["input", "output", "forward"]).default("forward"),
  protocol: z.string().optional().or(z.literal("")),
  srcAddress: z.string().optional().or(z.literal("")),
  dstAddress: z.string().optional().or(z.literal("")),
  srcPort: z.string().optional().or(z.literal("")),
  dstPort: z.string().optional().or(z.literal("")),
  interface: z.string().optional().or(z.literal("")),
  direction: z.string().optional().or(z.literal("")),
  priority: z.number().int().min(1).default(100),
  enabled: z.boolean().default(true),
  log: z.boolean().default(false),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.firewall.write");
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  ["description","protocol","srcAddress","dstAddress","srcPort","dstPort","interface","direction"].forEach((f) => { if (data[f] === "") data[f] = null; });

  const rule = await db.firewallRule.create({ data: { tenantId: ctx.tenantId, ...data } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "firewall.create", module: "policy", resource: "FirewallRule", resourceId: rule.id, requestId, message: `Created firewall rule ${rule.name} (${rule.action})` });
  return created({ id: rule.id, name: rule.name, action: rule.action }, requestId);
});
