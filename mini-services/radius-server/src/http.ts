// =====================================================================
// RADIUS WORKER HTTP API — control plane for the RADIUS server
// Endpoints:
//   GET  /health          — health check + stats
//   POST /coa/disconnect  — send RADIUS Disconnect-Request to a NAS
//   GET  /status          — detailed worker status
// =====================================================================

import { disconnectSession } from "./index";

const HTTP_PORT = 3030;

const server = Bun.serve({
  port: HTTP_PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS / health
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (path === "/health" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "cryptsk-radius-worker",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }

    if (path === "/coa/disconnect" && req.method === "POST") {
      try {
        const body = await req.json();
        const { nasIp, coaPort, sharedSecret, sessionId } = body;

        if (!nasIp || !sessionId || !sharedSecret) {
          return jsonResponse(
            { success: false, error: "Missing required fields: nasIp, coaPort, sharedSecret, sessionId" },
            400
          );
        }

        const success = await disconnectSession(
          nasIp,
          Number(coaPort) || 3799,
          sharedSecret,
          sessionId
        );

        return jsonResponse({
          success,
          method: "radius-disconnect-request",
          nasIp,
          sessionId,
          message: success
            ? "NAS acknowledged disconnect"
            : "NAS did not respond or returned NAK (session may still be active locally)",
        });
      } catch (err: any) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    if (path === "/status" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "cryptsk-radius-worker",
        uptime: process.uptime(),
        ports: {
          auth: parseInt(process.env.RADIUS_AUTH_PORT || "1812", 10),
          acct: parseInt(process.env.RADIUS_ACCT_PORT || "1813", 10),
          coa: parseInt(process.env.RADIUS_COA_PORT || "3799", 10),
          http: HTTP_PORT,
        },
        memory: process.memoryUsage(),
      });
    }

    return jsonResponse({ error: "Not found", path }, 404);
  },
});

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

console.log(`[radius-http] Control API listening on http://localhost:${HTTP_PORT}`);
