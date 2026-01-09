import { PrismaClient } from '@prisma/client'

// Ensure DATABASE_URL is set (fallback for local development)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

function normalizeDatabaseUrl(url: string): string {
  // Prisma + SQLite can easily hit lock/timeouts under concurrent writers.
  // The single most impactful mitigation is limiting each process to a single connection.
  // https://www.prisma.io/docs/orm/overview/databases/sqlite
  if (!url.startsWith('file:')) return url;

  // Already has query params
  if (url.includes('?')) {
    // Ensure connection_limit=1 is present
    if (/[?&]connection_limit=\d+/i.test(url)) return url;
    return `${url}&connection_limit=1`;
  }

  return `${url}?connection_limit=1`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: normalizeDatabaseUrl(process.env.DATABASE_URL) } }
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma 