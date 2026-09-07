// =====================================================================
// RADIUS SERVER — main UDP listener
// Listens on AUTH_PORT (1812), ACCT_PORT (1813), COA_PORT (3799).
// This is the Cryptsk AAA Access Gateway — the strategic differentiator.
// =====================================================================

import { createSocket, type Socket, type RemoteInfo } from "dgram";
import {
  decodePacket,
  encodePacket,
  buildResponseAuthenticator,
  generateAuthenticator,
  PacketCode,
  Attribute,
  stringAttr,
  type RadiusPacket,
  type RadiusAttribute,
} from "./packet";
import { handleAccessRequest } from "./authenticator";
import { handleAccountingRequest } from "./accounting";
import "./http"; // starts the HTTP control API on port 3030

const AUTH_PORT = parseInt(process.env.RADIUS_AUTH_PORT || "1812", 10);
const ACCT_PORT = parseInt(process.env.RADIUS_ACCT_PORT || "1813", 10);
const COA_PORT = parseInt(process.env.RADIUS_COA_PORT || "3799", 10);
const SHARED_SECRET = process.env.RADIUS_DEFAULT_SECRET || "cryptsk-shared-secret";

// Stats counters for observability
const stats = {
  authRequests: 0,
  authAccepts: 0,
  authRejects: 0,
  acctRequests: 0,
  acctStarts: 0,
  acctStops: 0,
  acctInterims: 0,
  coaRequests: 0,
  errors: 0,
  startTime: Date.now(),
};

// Helper: encode attributes to a buffer
function encodeAttributes(attrs: RadiusAttribute[]): Buffer {
  return Buffer.concat(
    attrs.map((attr) => {
      const header = Buffer.alloc(2);
      header[0] = attr.type;
      header[1] = 2 + attr.value.length;
      return Buffer.concat([header, attr.value]);
    })
  );
}

// Helper: look up the NAS shared secret by IP
async function getNasSecret(nasIp: string): Promise<{ secret: string; nasId: string | null }> {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  try {
    const nas = await db.nasClient.findFirst({
      where: { ipAddress: nasIp, status: "active" },
      select: { id: true, sharedSecret: true },
    });
    return {
      secret: nas?.sharedSecret || SHARED_SECRET,
      nasId: nas?.id ?? null,
    };
  } finally {
    await db.$disconnect();
  }
}

// ---------------------------------------------------------------------
// AUTHENTICATION SOCKET (UDP 1812)
// ---------------------------------------------------------------------

const authSocket: Socket = createSocket("udp4");

authSocket.on("message", async (data: Buffer, remote: RemoteInfo) => {
  stats.authRequests++;
  const nasIp = remote.address;

  try {
    const packet = decodePacket(data);
    if (packet.code !== PacketCode.ACCESS_REQUEST) {
      console.warn(`[radius-auth] Unexpected code ${packet.code} from ${nasIp}`);
      return;
    }

    const { secret } = await getNasSecret(nasIp);
    const result = await handleAccessRequest(packet, nasIp);

    if (result.accept) {
      stats.authAccepts++;
      const attrsBuffer = encodeAttributes(result.attributes);
      const responseAuth = buildResponseAuthenticator(
        PacketCode.ACCESS_ACCEPT,
        packet.identifier,
        attrsBuffer,
        packet.authenticator,
        secret
      );
      const response = encodePacket(
        PacketCode.ACCESS_ACCEPT,
        packet.identifier,
        responseAuth,
        result.attributes
      );
      authSocket.send(response, remote.port, remote.address);
    } else {
      stats.authRejects++;
      const attrsBuffer = encodeAttributes(result.attributes);
      const responseAuth = buildResponseAuthenticator(
        PacketCode.ACCESS_REJECT,
        packet.identifier,
        attrsBuffer,
        packet.authenticator,
        secret
      );
      const response = encodePacket(
        PacketCode.ACCESS_REJECT,
        packet.identifier,
        responseAuth,
        result.attributes
      );
      authSocket.send(response, remote.port, remote.address);
    }
  } catch (err) {
    stats.errors++;
    console.error(`[radius-auth] Error from ${nasIp}:`, err);
  }
});

authSocket.bind(AUTH_PORT, "0.0.0.0");
console.log(`[radius] Authentication listening on UDP ${AUTH_PORT}`);

// ---------------------------------------------------------------------
// ACCOUNTING SOCKET (UDP 1813)
// ---------------------------------------------------------------------

const acctSocket: Socket = createSocket("udp4");

acctSocket.on("message", async (data: Buffer, remote: RemoteInfo) => {
  stats.acctRequests++;
  const nasIp = remote.address;

  try {
    const packet = decodePacket(data);
    if (packet.code !== PacketCode.ACCOUNTING_REQUEST) {
      console.warn(`[radius-acct] Unexpected code ${packet.code} from ${nasIp}`);
      return;
    }

    const result = await handleAccountingRequest(packet, nasIp);
    if (result.action === "start") stats.acctStarts++;
    if (result.action === "stop") stats.acctStops++;
    if (result.action === "interim") stats.acctInterims++;

    const { secret } = await getNasSecret(nasIp);

    // Accounting-Response (code 5) with no attributes
    const attrsBuffer = Buffer.alloc(0);
    const responseAuth = buildResponseAuthenticator(
      PacketCode.ACCOUNTING_RESPONSE,
      packet.identifier,
      attrsBuffer,
      packet.authenticator,
      secret
    );
    const response = encodePacket(
      PacketCode.ACCOUNTING_RESPONSE,
      packet.identifier,
      responseAuth,
      []
    );
    acctSocket.send(response, remote.port, remote.address);
  } catch (err) {
    stats.errors++;
    console.error(`[radius-acct] Error from ${nasIp}:`, err);
  }
});

acctSocket.bind(ACCT_PORT, "0.0.0.0");
console.log(`[radius] Accounting listening on UDP ${ACCT_PORT}`);

// ---------------------------------------------------------------------
// COA / DISCONNECT SOCKET (UDP 3799) — listens for incoming CoA ACKs/NAKs
// ---------------------------------------------------------------------

const coaSocket: Socket = createSocket("udp4");

coaSocket.on("message", (data: Buffer, remote: RemoteInfo) => {
  stats.coaRequests++;
  try {
    const packet = decodePacket(data);
    console.log(
      `[radius-coa] Received code ${packet.code} from ${remote.address}:${remote.port}`
    );
  } catch (err) {
    console.error(`[radius-coa] Error from ${remote.address}:`, err);
  }
});

coaSocket.bind(COA_PORT, "0.0.0.0");
console.log(`[radius] CoA/Disconnect listening on UDP ${COA_PORT}`);

// ---------------------------------------------------------------------
// EXPORT — send CoA/Disconnect to a NAS (used by the API layer)
// ---------------------------------------------------------------------

/**
 * Send a CoA (Change of Authorization) or Disconnect packet to a NAS.
 * @returns true if ACK received, false if NAK or timeout
 */
export async function sendCoa(
  nasIp: string,
  nasCoaPort: number,
  sharedSecret: string,
  attributes: RadiusAttribute[],
  isDisconnect: boolean
): Promise<boolean> {
  return new Promise((resolve) => {
    const code = isDisconnect ? PacketCode.DISCONNECT_REQUEST : PacketCode.COA_REQUEST;
    const identifier = Math.floor(Math.random() * 256);
    const authenticator = generateAuthenticator();

    const request = encodePacket(code, identifier, authenticator, attributes);

    const socket: Socket = createSocket("udp4");
    const timeout = setTimeout(() => {
      socket.close();
      resolve(false);
    }, 2000);

    socket.on("message", (data: Buffer) => {
      clearTimeout(timeout);
      try {
        const response = decodePacket(data);
        const ackCode = isDisconnect ? PacketCode.DISCONNECT_ACK : PacketCode.COA_ACK;
        const success = response.code === ackCode;
        console.log(
          `[radius-coa] ${isDisconnect ? "Disconnect" : "CoA"} to ${nasIp}:${nasCoaPort} → ${success ? "ACK" : "NAK"}`
        );
        socket.close();
        resolve(success);
      } catch {
        socket.close();
        resolve(false);
      }
    });

    socket.send(request, nasCoaPort, nasIp);
  });
}

/**
 * Disconnect a specific session by session ID.
 * Used by the API when suspending/terminating a subscriber.
 */
export async function disconnectSession(
  nasIp: string,
  nasCoaPort: number,
  sharedSecret: string,
  sessionId: string
): Promise<boolean> {
  return sendCoa(
    nasIp,
    nasCoaPort,
    sharedSecret,
    [stringAttr(Attribute.ACCT_SESSION_ID, sessionId)],
    true
  );
}

// ---------------------------------------------------------------------
// HEALTH CHECK — periodically log stats
// ---------------------------------------------------------------------

setInterval(() => {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  console.log(
    `[radius-stats] uptime=${uptime}s auth=${stats.authRequests}(accept:${stats.authAccepts}/reject:${stats.authRejects}) acct=${stats.acctRequests}(start:${stats.acctStarts}/stop:${stats.acctStops}/interim:${stats.acctInterims}) coa=${stats.coaRequests} errors=${stats.errors}`
  );
}, 60000);

// Graceful shutdown
function shutdown() {
  console.log("[radius] Shutting down...");
  authSocket.close();
  acctSocket.close();
  coaSocket.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[radius] Cryptsk AAA Access Gateway ready`);
console.log(`[radius] Auth:    UDP ${AUTH_PORT}`);
console.log(`[radius] Acct:    UDP ${ACCT_PORT}`);
console.log(`[radius] CoA:     UDP ${COA_PORT}`);
