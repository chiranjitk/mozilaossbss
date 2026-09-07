// =====================================================================
// PASSWORD VERIFICATION — mirrors src/lib/crypto/password.ts
// Uses scrypt with constant-time compare. No external deps.
// =====================================================================

import { scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEYLEN = 64;

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(":");
    if (!saltHex || !hashHex) return false;

    const salt = Buffer.from(saltHex, "hex");
    const storedHash = Buffer.from(hashHex, "hex");
    const computedHash = await scrypt(password, salt, KEYLEN);

    if (computedHash.length !== storedHash.length) return false;
    return timingSafeEqual(computedHash, storedHash);
  } catch {
    return false;
  }
}
