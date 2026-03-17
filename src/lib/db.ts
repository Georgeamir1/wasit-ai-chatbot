import { PrismaClient } from '@prisma/client'

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create a new Prisma client instance
const createPrismaClient = () =>
  new PrismaClient({
    log: ['query'],
  })

// In development, always use the global singleton to avoid hot reload issues
// But force re-initialization when schema changes
const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

export { db }
