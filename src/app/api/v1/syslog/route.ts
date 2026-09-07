// =====================================================================
// SYSLOG API — list
// =====================================================================

import { NextRequest } from "next/server";
import { apiRoute, paginated } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";
import { listSyslog } from "@/core/repositories/monitoring";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  const ctx = await requireModulePermission("monitoring", "monitoring.logs.read");
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const severity = url.searchParams.get("severity") ?? undefined;
  const facility = url.searchParams.get("facility") ?? undefined;
  const nasId = url.searchParams.get("nasId") ?? undefined;

  const result = await listSyslog(
    ctx.tenantId,
    { search, severity, facility, nasId },
    url.searchParams
  );

  return paginated(
    result.data.map((e: any) => ({
      id: e.id,
      facility: e.facility,
      severity: e.severity,
      priority: e.priority,
      message: e.message,
      hostname: e.hostname,
      sourceIp: e.sourceIp,
      tag: e.tag,
      receivedAt: e.receivedAt,
    })),
    { page: result.page, pageSize: result.pageSize, total: result.total },
    requestId
  );
});
