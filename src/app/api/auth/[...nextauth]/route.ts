// NextAuth catch-all route handler
import NextAuth from "next-auth";
import { authOptions } from "@/core/auth/nextauth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
