// =====================================================================
// RADIUS WORKER HEALTH — check if the RADIUS server is running
// =====================================================================

import { NextRequest } from "next/server";
import { apiRoute, ok } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req: NextRequest, { requestId }) => {
  await requireModulePermission("aaa", "aaa.session.read");

  try {
    const res = await fetch("http://localhost:3030/health", {
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      return ok({ running: false, status: "unreachable" });
    }

    const data = await res.json();
    return ok({
      running: true,
      status: "healthy",
      uptime: data.uptime,
      timestamp: data.timestamp,
    });
  } catch {
    return ok({
      running: false,
      status: "stopped",
      message: "RADIUS worker is not running. Start it with: cd mini-services/radius-server && bun run dev",
    });
  }
});
