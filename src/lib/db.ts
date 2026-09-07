import { PrismaClient } from '@prisma/client'

// Single PrismaClient instance shared across hot-reloads.
// Query logging is OFF by default — enable DEBUG=prisma:query when needed.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.DEBUG?.includes('prisma')
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
