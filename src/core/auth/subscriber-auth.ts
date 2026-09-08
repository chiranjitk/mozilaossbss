// =====================================================================
// SUBSCRIBER AUTH — Self-Care Portal
// Separate auth system for subscribers (NOT NextAuth).
// Stateless JWT (HMAC-SHA256) using Web Crypto API.
// Cookie name: cryptsk_subscriber_session (httpOnly, sameSite=lax).
// =====================================================================

import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto/password";
import { ApiError } from "@/core/api/errors";
import type { Subscriber } from "@prisma/client";

export const SUBSCRIBER_COOKIE = "cryptsk_subscriber_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET ||
    "cryptsk-dev-secret-change-me-in-production-32chars"
  );
}

// ---------------------------------------------------------------------
// JWT-ish token: base64url(header).base64url(payload).base64url(sig)
// { alg, typ } header. { sub, iat, exp } payload. HMAC-SHA256 signature.
// ---------------------------------------------------------------------

interface SubscriberToken {
  sub: string; // subscriber ID
  iat: number; // issued at (seconds)
  exp: number; // expiry (seconds)
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSubscriberToken(subscriberId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SubscriberToken = {
    sub: subscriberId,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const sig = sign(signingInput);
  return `${signingInput}.${sig}`;
}

export function verifySubscriberToken(token: string): SubscriberToken | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = sign(`${header}.${body}`);

    // Constant-time compare
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(fromB64url(body).toString("utf8")) as SubscriberToken;
    if (!payload.sub || !payload.exp) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Cookie helpers — set on login, clear on logout
// ---------------------------------------------------------------------

export async function setSubscriberSession(subscriberId: string): Promise<void> {
  const token = createSubscriberToken(subscriberId);
  const store = await cookies();
  store.set(SUBSCRIBER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSubscriberSession(): Promise<void> {
  const store = await cookies();
  store.delete(SUBSCRIBER_COOKIE);
}

// ---------------------------------------------------------------------
// Session retrieval — used by API routes and server components
// ---------------------------------------------------------------------

export interface SubscriberSession {
  subscriber: Subscriber;
}

export async function getSubscriberSession(): Promise<SubscriberSession | null> {
  const store = await cookies();
  const token = store.get(SUBSCRIBER_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySubscriberToken(token);
  if (!payload) return null;

  const subscriber = await db.subscriber.findUnique({
    where: { id: payload.sub },
  });
  if (!subscriber) return null;

  // Re-check status: a suspended/terminated subscriber cannot use the portal
  if (subscriber.status === "terminated") return null;

  return { subscriber };
}

/**
 * Require a subscriber session or throw ApiError.
 * Use this as the standard guard at the top of any portal API.
 */
export async function requireSubscriber(): Promise<SubscriberSession> {
  const session = await getSubscriberSession();
  if (!session) {
    throw ApiError.unauthenticated();
  }
  return session;
}

/**
 * Authenticate a subscriber by username + plaintext password.
 * Returns the subscriber if valid, throws ApiError otherwise.
 */
export async function authenticateSubscriber(
  username: string,
  password: string
): Promise<Subscriber> {
  const subscriber = await db.subscriber.findUnique({
    where: { username },
  });
  if (!subscriber || !subscriber.passwordHash) {
    throw ApiError.unauthenticated();
  }
  if (subscriber.status === "terminated") {
    throw ApiError.forbidden("Account terminated");
  }

  const valid = await verifyPassword(password, subscriber.passwordHash);
  if (!valid) {
    throw ApiError.unauthenticated();
  }

  return subscriber;
}
