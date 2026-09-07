// =====================================================================
// NEXTAUTH CONFIGURATION
// Credentials provider with bcrypt-like password verification.
// Session strategy: JWT (stateless, production-ready).
// =====================================================================

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto/password";
import { logger } from "@/core/logging/logger";
import { EVENTS, eventBus } from "@/core/events/bus";

// Extend NextAuth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      username: string;
      tenantId: string;
      tenantName: string;
      tenantSlug: string;
      roles: string[];
      permissions: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    roles: string[];
    permissions: string[];
  }
}

export const authOptions: NextAuthOptions = {
  // JWT strategy — stateless, scales horizontally without a session store
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8 hours

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { username: credentials.username },
          include: {
            tenant: true,
            userRoles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        });

        if (!user) {
          logger.warn("Login attempt: unknown user", {
            module: "auth",
            username: credentials.username,
          });
          return null;
        }

        if (user.status !== "active") {
          logger.warn("Login attempt: inactive user", {
            module: "auth",
            username: credentials.username,
            status: user.status,
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          logger.warn("Login attempt: locked account", {
            module: "auth",
            username: credentials.username,
          });
          return null;
        }

        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) {
          // Increment failed attempts; lock after 5
          const attempts = user.failedAttempts + 1;
          const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
          await db.user.update({
            where: { id: user.id },
            data: {
              failedAttempts: attempts,
              lockedUntil,
            },
          });
          logger.warn("Login attempt: invalid password", {
            module: "auth",
            username: credentials.username,
            attempts,
          });
          return null;
        }

        // Reset failed attempts, record login
        const reqHeaders = req?.headers ?? {};
        const ip =
          (reqHeaders["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          (reqHeaders["x-real-ip"] as string) ||
          "unknown";
        const userAgent = (reqHeaders["user-agent"] as string) ?? null;

        await db.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
          },
        });

        // Collect permissions
        const roles = user.userRoles.map((ur) => ur.role.name);
        const permissions = Array.from(
          new Set(
            user.userRoles.flatMap((ur) =>
              ur.role.permissions.map((rp) => rp.permission.key)
            )
          )
        );

        await eventBus.emit(
          EVENTS.USER_LOGIN,
          { userId: user.id, username: user.username, ip },
          { tenantId: user.tenantId, source: "auth" }
        );

        logger.info("User logged in", {
          module: "auth",
          userId: user.id,
          username: user.username,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          tenantSlug: user.tenant.slug,
          roles,
          permissions,
        } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // First sign-in: persist identity into the JWT
        const u = user as any;
        token.userId = u.id;
        token.tenantId = u.tenantId;
        token.tenantName = u.tenantName;
        token.tenantSlug = u.tenantSlug;
        token.roles = u.roles;
        token.permissions = u.permissions;
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        id: token.userId,
        email: token.email ?? "",
        name: token.name ?? null,
        username: (token as any).username ?? "",
        tenantId: token.tenantId,
        tenantName: token.tenantName,
        tenantSlug: token.tenantSlug,
        roles: token.roles ?? [],
        permissions: token.permissions ?? [],
      };
      return session;
    },
  },

  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
  },

  // Use the configured secret
  secret: process.env.NEXTAUTH_SECRET,
};
