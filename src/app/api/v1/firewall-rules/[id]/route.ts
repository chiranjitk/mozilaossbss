// =====================================================================
// FIREWALL RULE DETAIL API — GET, PATCH, DELETE
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.firewall.read");
  const id = new URL(req.url).pathname.split("/")[4];
  const r = await db.firewallRule.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!r) throw ApiError.notFound("Rule", id);
  return ok(r);
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().or(z.literal("")),
  action: z.enum(["accept", "drop", "reject", "masquerade"]).optional(),
  chain: z.enum(["input", "output", "forward"]).optional(),
  protocol: z.string().optional().or(z.literal("")),
  srcAddress: z.string().optional().or(z.literal("")),
  dstAddress: z.string().optional().or(z.literal("")),
  srcPort: z.string().optional().or(z.literal("")),
  dstPort: z.string().optional().or(z.literal("")),
  interface: z.string().optional().or(z.literal("")),
  direction: z.string().optional().or(z.literal("")),
  priority: z.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
  log: z.boolean().optional(),
});

export const PATCH = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.firewall.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.firewallRule.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Rule", id);
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  const data: any = { ...parsed.data };
  ["description","protocol","srcAddress","dstAddress","srcPort","dstPort","interface","direction"].forEach((f) => { if (data[f] === "") data[f] = null; });
  const updated = await db.firewallRule.update({ where: { id }, data });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "firewall.update", module: "policy", resource: "FirewallRule", resourceId: id, requestId, message: `Updated firewall rule ${updated.name}` });
  return ok({ id: updated.id, name: updated.name, enabled: updated.enabled });
});

export const DELETE = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("policy", "policy.firewall.write");
  const id = new URL(req.url).pathname.split("/")[4];
  const existing = await db.firewallRule.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw ApiError.notFound("Rule", id);
  await db.firewallRule.delete({ where: { id } });
  await recordAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "firewall.delete", module: "policy", resource: "FirewallRule", resourceId: id, requestId, message: `Deleted firewall rule ${existing.name}` });
  return ok({ deleted: true, id });
});
