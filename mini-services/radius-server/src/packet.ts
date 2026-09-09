// =====================================================================
// RADIUS PACKET CODEC — RFC 2865 (Authentication), RFC 2866 (Accounting)
// Pure TypeScript, no external deps. Encodes/decodes UDP RADIUS packets.
// =====================================================================

// RADIUS packet codes
export const PacketCode = {
  ACCESS_REQUEST: 1,
  ACCESS_ACCEPT: 2,
  ACCESS_REJECT: 3,
  ACCOUNTING_REQUEST: 4,
  ACCOUNTING_RESPONSE: 5,
  ACCESS_CHALLENGE: 11,
  STATUS_SERVER: 12,
  STATUS_CLIENT: 13,
  DISCONNECT_REQUEST: 40,
  DISCONNECT_ACK: 41,
  DISCONNECT_NAK: 42,
  COA_REQUEST: 43,
  COA_ACK: 44,
  COA_NAK: 45,
} as const;

export type PacketCode = (typeof PacketCode)[keyof typeof PacketCode];

// Standard RADIUS attributes (RFC 2865)
export const Attribute = {
  USER_NAME: 1,
  USER_PASSWORD: 2,
  CHAP_PASSWORD: 3,
  NAS_IP_ADDRESS: 4,
  NAS_PORT: 5,
  SERVICE_TYPE: 6,
  FRAMED_PROTOCOL: 7,
  FRAMED_IP_ADDRESS: 8,
  FRAMED_IP_NETMASK: 9,
  FRAMED_ROUTING: 10,
  FILTER_ID: 11,
  FRAMED_MTU: 12,
  FRAMED_COMPRESSION: 13,
  LOGIN_IP_HOST: 14,
  LOGIN_SERVICE: 15,
  LOGIN_TCP_PORT: 16,
  REPLY_MESSAGE: 18,
  CALLBACK_NUMBER: 19,
  CALLBACK_ID: 20,
  FRAMED_ROUTE: 22,
  FRAMED_IPX_NETWORK: 23,
  STATE: 24,
  CLASS: 25,
  VENDOR_SPECIFIC: 26,
  SESSION_TIMEOUT: 27,
  IDLE_TIMEOUT: 28,
  TERMINATION_ACTION: 29,
  CALLED_STATION_ID: 30,
  CALLING_STATION_ID: 31,
  NAS_IDENTIFIER: 32,
  PROXY_STATE: 33,
  LOGIN_LAT_SERVICE: 34,
  LOGIN_LAT_NODE: 35,
  LOGIN_LAT_GROUP: 36,
  FRAMED_APPLETALK_LINK: 37,
  FRAMED_APPLETALK_NETWORK: 38,
  FRAMED_APPLETALK_ZONE: 39,
  ACCT_STATUS_TYPE: 40,
  ACCT_DELAY_TIME: 41,
  ACCT_INPUT_OCTETS: 42,
  ACCT_OUTPUT_OCTETS: 43,
  ACCT_SESSION_ID: 44,
  ACCT_AUTHENTIC: 45,
  ACCT_SESSION_TIME: 46,
  ACCT_INPUT_PACKETS: 47,
  ACCT_OUTPUT_PACKETS: 48,
  ACCT_TERMINATE_CAUSE: 49,
  ACCT_MULTI_SESSION_ID: 50,
  ACCT_LINK_COUNT: 51,
  NAS_PORT_TYPE: 61,
  PORT_LIMIT: 62,
  LOGIN_LAT_PORT: 63,
  TUNNEL_TYPE: 64,
  TUNNEL_MEDIUM_TYPE: 65,
  TUNNEL_CLIENT_ENDPOINT: 66,
  TUNNEL_SERVER_ENDPOINT: 67,
  ACCT_TUNNEL_CONNECTION: 68,
  TUNNEL_PASSWORD: 69,
  ARAP_PASSWORD: 70,
  ARAP_FEATURES: 71,
  ARAP_ZONE_ACCESS: 72,
  ARAP_SECURITY: 73,
  ARAP_SECURITY_DATA: 74,
  PASSWORD_RETRY: 75,
  PROMPT: 76,
  CONNECT_INFO: 77,
  CONFIGURATION_TOKEN: 78,
  EAP_MESSAGE: 79,
  MESSAGE_AUTHENTICATOR: 80,
  TUNNEL_PRIVATE_GROUP_ID: 81,
  NAS_PORT_ID: 87,
  FRAMED_POOL: 88,
  NAS_IPV6_ADDRESS: 95,
  FRAMED_INTERFACE_ID: 96,
  FRAMED_IPV6_PREFIX: 97,
} as const;

export type AttributeType = (typeof Attribute)[keyof typeof Attribute];

// Reverse lookup for debugging
export const ATTRIBUTE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(Attribute).map(([k, v]) => [v as number, k])
);

// Accounting status types (RFC 2866)
export const AcctStatusType = {
  START: 1,
  STOP: 2,
  INTERIM: 3,
  ON: 7,
  OFF: 8,
} as const;

// Termination causes
export const TERMINATION_CAUSES: Record<number, string> = {
  1: "User-Request",
  2: "Lost-Carrier",
  3: "Lost-Service",
  4: "Idle-Timeout",
  5: "Session-Timeout",
  6: "Admin-Reset",
  7: "Admin-Reboot",
  8: "Port-Error",
  9: "NAS-Error",
  10: "NAS-Request",
  11: "NAS-Reboot",
  12: "Port-Unneeded",
  13: "Port-Preempted",
  14: "Port-Suspended",
  15: "Service-Unavailable",
  16: "Callback",
  17: "User-Error",
  18: "Host-Request",
};

export interface RadiusAttribute {
  type: number;
  value: Buffer;
}

export interface RadiusPacket {
  code: number;
  identifier: number;
  authenticator: Buffer; // 16 bytes
  attributes: RadiusAttribute[];
}

/**
 * Parse a RADIUS packet from a UDP buffer.
 * Validates length, authenticator (16 bytes), and attribute TLV structure.
 */
export function decodePacket(buf: Buffer): RadiusPacket {
  if (buf.length < 20) {
    throw new Error(`RADIUS packet too short: ${buf.length} bytes (min 20)`);
  }

  const code = buf[0];
  const identifier = buf[1];
  const length = buf.readUInt16BE(2);
  const authenticator = buf.subarray(4, 20);

  if (length > buf.length) {
    throw new Error(
      `RADIUS packet length ${length} exceeds buffer ${buf.length}`
    );
  }

  const attributes: RadiusAttribute[] = [];
  let offset = 20;
  while (offset < length) {
    if (offset + 2 > length) {
      throw new Error(`Truncated attribute at offset ${offset}`);
    }
    const attrType = buf[offset];
    const attrLen = buf[offset + 1];
    if (attrLen < 2 || offset + attrLen > length) {
      throw new Error(
        `Invalid attribute length ${attrLen} at offset ${offset} (packet length ${length})`
      );
    }
    const value = buf.subarray(offset + 2, offset + attrLen);
    attributes.push({ type: attrType, value: Buffer.from(value) });
    offset += attrLen;
  }

  return { code, identifier, authenticator, attributes };
}

/**
 * Encode a RADIUS packet into a UDP buffer.
 */
export function encodePacket(
  code: number,
  identifier: number,
  authenticator: Buffer,
  attributes: RadiusAttribute[]
): Buffer {
  const attrBuffers = attributes.map((attr) => {
    const header = Buffer.alloc(2);
    header[0] = attr.type;
    header[1] = 2 + attr.value.length;
    return Buffer.concat([header, attr.value]);
  });

  const length = 20 + attrBuffers.reduce((sum, b) => sum + b.length, 0);
  const header = Buffer.alloc(20);
  header[0] = code;
  header[1] = identifier;
  header.writeUInt16BE(length, 2);
  authenticator.copy(header, 4);

  return Buffer.concat([header, ...attrBuffers]);
}

// ---------------------------------------------------------------------
// ATTRIBUTE VALUE HELPERS
// ---------------------------------------------------------------------

export function getString(attrs: RadiusAttribute[], type: number): string | null {
  const attr = attrs.find((a) => a.type === type);
  return attr ? attr.value.toString("utf8") : null;
}

export function getInteger(attrs: RadiusAttribute[], type: number): number | null {
  const attr = attrs.find((a) => a.type === type);
  if (!attr || attr.value.length !== 4) return null;
  return attr.value.readUInt32BE(0);
}

export function getIpAddress(attrs: RadiusAttribute[], type: number): string | null {
  const attr = attrs.find((a) => a.type === type);
  if (!attr || attr.value.length !== 4) return null;
  return Array.from(attr.value).join(".");
}

export function getHexString(attrs: RadiusAttribute[], type: number): string | null {
  const attr = attrs.find((a) => a.type === type);
  if (!attr) return null;
  return attr.value.toString("hex");
}

// Attribute builders
export function stringAttr(type: number, value: string): RadiusAttribute {
  return { type, value: Buffer.from(value, "utf8") };
}

export function intAttr(type: number, value: number): RadiusAttribute {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return { type, value: buf };
}

export function ipAttr(type: number, ip: string): RadiusAttribute {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IP: ${ip}`);
  }
  return { type, value: Buffer.from(parts) };
}

// ---------------------------------------------------------------------
// VENDOR-SPECIFIC ATTRIBUTES (RFC 2865 §5.26)
//   VSA = Type(26) + Len + Vendor-Id(4, BE) + Vendor-Type(1) + Vendor-Len(1) + Data
// MikroTik vendor-id 14988 (attr 8 = Rate-Limit string),
// WISPr vendor-id 14122 (attr 7 = BW-Max-Down, attr 8 = BW-Max-Up, int32 bits/s).
// ---------------------------------------------------------------------

export function vendorSpecificAttr(
  vendorId: number,
  vendorType: number,
  data: Buffer
): RadiusAttribute {
  if (data.length > 253) {
    throw new Error(`VSA data too long: ${data.length}`);
  }
  const buf = Buffer.alloc(6 + data.length);
  buf.writeUInt32BE(vendorId, 0);
  buf[4] = vendorType;
  buf[5] = data.length + 2; // vendor-len includes type+len octets
  data.copy(buf, 6);
  return { type: 26, value: buf };
}

export function vsaString(vendorId: number, vendorType: number, value: string): RadiusAttribute {
  return vendorSpecificAttr(vendorId, vendorType, Buffer.from(value, "utf8"));
}

export function vsaInt(vendorId: number, vendorType: number, value: number): RadiusAttribute {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value >>> 0, 0);
  return vendorSpecificAttr(vendorId, vendorType, buf);
}

// Vendor IDs used by this server
export const VENDOR_MIKROTIK = 14988;
export const VENDOR_WISPR = 14122;
// MikroTik vendor attribute types
export const MIKROTIK_RATE_LIMIT = 8;
// WISPr vendor attribute types
export const WISPR_BW_MAX_DOWN = 7;
export const WISPR_BW_MAX_UP = 8;

// ---------------------------------------------------------------------
// REQUEST AUTHENTICATOR VERIFICATION (RFC 2865 §3)
// ---------------------------------------------------------------------

import { createHash, createHmac, randomBytes } from "crypto";

/**
 * Verify the User-Password attribute (RFC 2865 §5.2).
 * Decrypts the password using the shared secret + request authenticator.
 */
export function decryptUserPassword(
  encrypted: Buffer,
  sharedSecret: string,
  authenticator: Buffer
): string {
  const secret = Buffer.from(sharedSecret, "utf8");
  const result: Buffer[] = [];

  // Process in 16-byte blocks (b1, b2, ...)
  let prev = authenticator;
  for (let i = 0; i < encrypted.length; i += 16) {
    const block = encrypted.subarray(i, i + 16);
    const hash = createHash("md5").update(Buffer.concat([secret, prev])).digest();
    const decrypted = Buffer.alloc(16);
    for (let j = 0; j < 16 && i + j < encrypted.length; j++) {
      decrypted[j] = block[j] ^ hash[j];
    }
    result.push(decrypted);
    prev = block;
  }

  const full = Buffer.concat(result);
  // Strip trailing nulls (padding)
  const firstNull = full.indexOf(0);
  return (firstNull === -1 ? full : full.subarray(0, firstNull)).toString("utf8");
}

/**
 * Build the Response Authenticator (RFC 2865 §3).
 * MD5(Code + ID + Length + RequestAuthenticator + Attributes + Secret)
 */
export function buildResponseAuthenticator(
  code: number,
  identifier: number,
  attributesBuffer: Buffer,
  requestAuthenticator: Buffer,
  sharedSecret: string
): Buffer {
  const length = 20 + attributesBuffer.length;
  const header = Buffer.alloc(20);
  header[0] = code;
  header[1] = identifier;
  header.writeUInt16BE(length, 2);
  // Request authenticator goes here (not the response one)
  requestAuthenticator.copy(header, 4);

  const toHash = Buffer.concat([
    header,
    attributesBuffer,
    Buffer.from(sharedSecret, "utf8"),
  ]);
  return createHash("md5").update(toHash).digest();
}

/**
 * Verify the Message-Authenticator attribute (RFC 3579) for EAP / safety.
 * HMAC-MD5 of the whole packet (with MA set to zeros) using the shared secret.
 */
export function verifyMessageAuthenticator(
  packet: Buffer,
  maValue: Buffer,
  sharedSecret: string
): boolean {
  // Zero out the MA value in a copy
  const copy = Buffer.from(packet);
  // Find MA attribute (type 80) and zero its value
  let offset = 20;
  while (offset < copy.length - 2) {
    const type = copy[offset];
    const len = copy[offset + 1];
    if (type === 80 && len === 18) {
      copy.fill(0, offset + 2, offset + 18);
      break;
    }
    offset += len;
  }
  const computed = createHmac("md5", Buffer.from(sharedSecret, "utf8"))
    .update(copy)
    .digest();
  return computed.equals(maValue);
}

/**
 * Build an Access-Request authenticator (RFC 2865 §5).
 * 16 random bytes — but must be unpredictable. Used by clients.
 */
export function generateAuthenticator(): Buffer {
  return Buffer.from(randomBytes(16));
}
