// =====================================================================
// PASSWORD HASHING — bcrypt-like using Node's scrypt
// No external deps; safe for sandbox; production-grade.
// =====================================================================

import { scrypt as _scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEYLEN = 64;

/**
 * Hash a password using scrypt with a random 16-byte salt.
 * Returns "salt:hash" as a hex string.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verify a password against a "salt:hash" string.
 * Constant-time comparison to prevent timing attacks.
 */
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
