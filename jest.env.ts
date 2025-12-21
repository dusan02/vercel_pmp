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
try {
  const seedDb = seedCandidates.find(p => fs.existsSync(p));
  if (seedDb) {
    fs.copyFileSync(seedDb, dbPath);
  } else {
    fs.closeSync(fs.openSync(dbPath, 'w'));
  }
} catch {
  // Fallback: ensure file exists
  try {
    fs.closeSync(fs.openSync(dbPath, 'w'));
  } catch {
    // ignore
  }
}

// Prisma expects file:... URL, with forward slashes
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;


