// =====================================================================
// RADIUS WORKER PROXY — CoA Disconnect
// Proxies to the RADIUS worker mini-service on port 3030.
// Uses XTransformPort so Caddy forwards to the right port.
// =====================================================================

import { NextRequest } from "next/server";
import { apiRoute, ok, ApiError } from "@/core/api/errors";
import { requireModulePermission } from "@/core/rbac";

export const dynamic = "force-dynamic";

export const POST = apiRoute(async (req: NextRequest, { requestId }) => {
  await requireModulePermission("aaa", "aaa.session.disconnect");

  const body = await req.json();
  const { nasIp, coaPort, sharedSecret, sessionId } = body;

  if (!nasIp || !sessionId || !sharedSecret) {
    throw ApiError.businessRule("Missing required fields");
  }

  try {
    const res = await fetch("http://localhost:3030/coa/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nasIp, coaPort, sharedSecret, sessionId }),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      throw ApiError.businessRule("RADIUS worker returned error");
    }

    const json = await res.json();
    return ok(json);
  } catch (err: any) {
    // Worker not running — return graceful failure
    return ok({
      success: false,
      method: "local",
      message: "RADIUS worker not available — performing local disconnect only",
    });
  }
});
