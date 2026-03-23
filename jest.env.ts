/**
 * jest.env.ts
 *
 * Runs before test modules are evaluated (via Jest `setupFiles`).
 * Ensures Prisma SQLite uses a writable per-worker database on Windows.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// Create a per-worker DB file to avoid sqlite locking across Jest workers
const workerId = process.env.JEST_WORKER_ID ?? '0';
const dir = path.join(os.tmpdir(), 'pmp_prisma_tests');
fs.mkdirSync(dir, { recursive: true });

const dbPath = path.join(dir, `pmp-test-${workerId}.db`);

// Seed from repo dev DB if available (fast, includes schema)
// Prefer the larger DB under prisma/prisma/dev.db (the smaller prisma/dev.db may be empty)
const seedCandidates = [
  path.join(process.cwd(), 'prisma', 'prisma', 'dev.db'),
  path.join(process.cwd(), 'prisma', 'dev.db'),
];

// If a specific DATABASE_URL is provided (e.g. from CI), prioritize it as the seed
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
  // Prisma SQLite files are relative to the schema directory by default
  const dbFileName = process.env.DATABASE_URL.replace('file:', '').replace(/^\.\//, '');
  // Fix: Resolve using project root; Prisma URL may already include 'prisma/'
  const customSeedPath = path.resolve(process.cwd(), dbFileName);
  console.log(`[jest.env.ts] Identified custom seed DB path from DATABASE_URL: ${customSeedPath}`);
  seedCandidates.unshift(customSeedPath);
}

try {
  console.log(`[jest.env.ts] Checking seed candidates:`, seedCandidates);
  const seedDb = seedCandidates.find(p => fs.existsSync(p));
  if (seedDb) {
    console.log(`[jest.env.ts] Using seed DB: ${seedDb}`);
    fs.copyFileSync(seedDb, dbPath);
  } else {
    console.log(`[jest.env.ts] No seed DB found. Creating empty DB at: ${dbPath}`);
    fs.closeSync(fs.openSync(dbPath, 'w'));
  }
} catch (err: any) {
  console.error(`[jest.env.ts] Error setting up test DB:`, err.message);
  // Fallback: ensure file exists
  try {
    fs.closeSync(fs.openSync(dbPath, 'w'));
  } catch {
    // ignore
  }
}

// Prisma expects file:... URL, with forward slashes
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;


