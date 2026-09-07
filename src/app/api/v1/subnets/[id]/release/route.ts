// =====================================================================
// IP RELEASE API — release an allocated IP back to available
// POST /api/v1/subnets/[id]/release
// =====================================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { recordAudit } from "@/core/repositories/audit";
import { releaseIp } from "@/core/repositories/network/subnet";
import { isValidIp } from "@/core/network/cidr";

export const dynamic = "force-dynamic";

const releaseSchema = z.object({
  ipAddress: z.string().refine(isValidIp, "Invalid IP address"),
});

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("network", "network.ipam.write");
  const _subnetId = new URL(req.url).pathname.split("/")[4];

  const body = await req.json();
  const parsed = releaseSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error);
  }

  try {
    await releaseIp(ctx.tenantId, parsed.data.ipAddress);
  } catch (err) {
    throw ApiError.businessRule(
      err instanceof Error ? err.message : "Failed to release IP"
    );
  }

  await recordAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "ip.release",
    module: "network",
    resource: "IpAddress",
    resourceId: parsed.data.ipAddress,
    requestId,
    message: `Released IP ${parsed.data.ipAddress}`,
  });

  return ok({ released: true, ipAddress: parsed.data.ipAddress });
});
