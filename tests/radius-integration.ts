// =====================================================================
// RADIUS INTEGRATION TEST — real UDP Access-Request against the live server
// Verifies the table-driven authorization flow:
//   radcheck password → radusergroup → radgroupreply VSAs → Access-Accept
// Run: bun tests/radius-integration.ts
// =====================================================================

import * as dgram from "node:dgram";
import {
  PacketCode,
  Attribute,
  stringAttr,
  encryptUserPassword,
  encodePacket,
  decodePacket,
  generateAuthenticator,
  type RadiusAttribute,
} from "../mini-services/radius-server/src/packet";

const SECRET = "testing123"; // will be read from NAS table below
const AUTH_PORT = 1812;

async function getNasSecret(): Promise<string> {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const nas = await db.nasClient.findFirst({ where: { status: "active" } });
  await db.$disconnect();
  if (!nas) throw new Error("No active NAS client in DB");
  return nas.sharedSecret;
}

async function sendAccessRequest(
  secret: string,
  username: string,
  password: string
): Promise<{ code: number; attributes: RadiusAttribute[]; raw: Buffer }> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    const authenticator = generateAuthenticator();
    const attrs: RadiusAttribute[] = [
      stringAttr(Attribute.USER_NAME, username),
      // encryptUserPassword needs the same API as the server's decrypt
      encryptPasswordAttr(secret, authenticator, password),
    ];
    const packet = encodePacket(PacketCode.ACCESS_REQUEST, 42, authenticator, attrs);

    sock.on("message", (msg) => {
      const decoded = decodePacket(msg);
      sock.close();
      resolve({ code: decoded.code, attributes: decoded.attributes, raw: msg });
    });
    sock.on("error", (err) => {
      sock.close();
      reject(err);
    });

    sock.send(packet, AUTH_PORT, "127.0.0.1", (err) => {
      if (err) {
        sock.close();
        reject(err);
      }
    });

    setTimeout(() => {
      try { sock.close(); } catch {}
      reject(new Error("RADIUS request timeout"));
    }, 5000);
  });
}

// Local copy of RFC 2865 §5.2 encryption (client side)
function encryptPasswordAttr(secret: string, authenticator: Buffer, password: string): RadiusAttribute {
  const { createHash } = require("node:crypto");
  const buf = Buffer.from(password, "utf8");
  const padded = Buffer.alloc(Math.ceil((buf.length + 1) / 16) * 16);
  buf.copy(padded);
  const secretHash = createHash("md5").update(`${secret}${authenticator.toString("binary")}`, "binary").digest();
  const encrypted = Buffer.alloc(padded.length);
  let prev = secretHash;
  for (let i = 0; i < padded.length; i += 16) {
    const chunk = padded.subarray(i, i + 16);
    const hash = createHash("md5").update(Buffer.concat([prev, chunk])).digest();
    for (let j = 0; j < 16; j++) encrypted[i + j] = chunk[j] ^ hash[j];
    prev = encrypted.subarray(i, i + 16);
  }
  void secretHash;
  return { type: Attribute.USER_PASSWORD, value: encrypted };
}

function getStringAttr(attrs: RadiusAttribute[], type: number): string | null {
  const attr = attrs.find((a) => a.type === type);
  return attr ? attr.value.toString("utf8") : null;
}

function findVsa(attrs: RadiusAttribute[], vendorId: number, vendorType: number): string | null {
  for (const a of attrs) {
    if (a.type !== 26 || a.value.length < 6) continue;
    const vid = a.value.readUInt32BE(0);
    if (vid !== vendorId) continue;
    const vType = a.value[4];
    const vLen = a.value[5];
    if (vType === vendorType) {
      return a.value.subarray(6, 4 + vLen).toString("utf8");
    }
  }
  return null;
}

const VENDOR_MIKROTIK = 14988;
const MIKROTIK_RATE_LIMIT = 8;

async function main() {
  const secret = await getNasSecret();
  console.log(`NAS secret: ${secret.slice(0, 3)}••• (from DB)`);

  // 1. Valid credentials → Access-Accept + rate-limit VSA from radgroupreply
  let res = await sendAccessRequest(secret, "rahul.sharma", "subscriber123");
  const accepted = res.code === PacketCode.ACCESS_ACCEPT;
  const mrl = findVsa(res.attributes, VENDOR_MIKROTIK, MIKROTIK_RATE_LIMIT);
  const replyMsg = getStringAttr(res.attributes, Attribute.REPLY_MESSAGE);
  console.log(`1. valid auth  → ${res.code === PacketCode.ACCESS_ACCEPT ? "Access-Accept ✓" : `code ${res.code} ✗`}`);
  console.log(`   Mikrotik-Rate-Limit VSA: ${mrl ?? "MISSING"}`);
  console.log(`   Reply-Message: ${replyMsg ?? "(none)"}`);

  // 2. Wrong password → Access-Reject
  res = await sendAccessRequest(secret, "rahul.sharma", "wrongpassword");
  const rejected = res.code === PacketCode.ACCESS_REJECT;
  console.log(`2. bad auth    → ${res.code === PacketCode.ACCESS_REJECT ? "Access-Reject ✓" : `code ${res.code} ✗`} (${getStringAttr(res.attributes, Attribute.REPLY_MESSAGE) ?? ""})`);

  // 3. Unknown user → Access-Reject
  res = await sendAccessRequest(secret, "no.such.user", "whatever");
  const rejected2 = res.code === PacketCode.ACCESS_REJECT;
  console.log(`3. unknown usr → ${res.code === PacketCode.ACCESS_REJECT ? "Access-Reject ✓" : `code ${res.code} ✗`}`);

  if (accepted && mrl && rejected && rejected2) {
    console.log("\n✓ RADIUS table-driven authorization flow VERIFIED");
  } else {
    console.log("\n✗ RADIUS integration test FAILED");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test error:", e.message);
  process.exit(1);
});
