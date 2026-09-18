/**
 * Import Early Winners score export (JSON) into EwScoreSnapshot.
 *
 * Produces the rows rendered by /screener/early-winners and the
 * PmpScoreSection on /analysis/[ticker].
 *
 * Pipeline:
 *   quant engine (Postgres PIT DB)  →  --json-out export  →  this importer  →  SQLite
 *
 * The engine export is generated wherever QUANT_DB lives; this script only
 * reads the JSON file and writes to the app DB. Idempotent — safe to re-run.
 *
 * Run:   npx tsx scripts/import-ew-scores.ts <export.json>
 * Cron:  daily via PM2 (cron-ew-score-import) — file path via EW_EXPORT_PATH
 */
import fs from 'fs';
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import {
  ExportValidationError,
  importEwScores,
} from '../src/lib/earlywinners/score-import';

async function main() {
  const file = process.argv[2] ?? process.env.EW_EXPORT_PATH;
  if (!file) {
    console.error('Usage: npx tsx scripts/import-ew-scores.ts <export.json>');
    console.error('   or: EW_EXPORT_PATH=/path/export.json npx tsx scripts/import-ew-scores.ts');
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    // No export shipped yet — scheduled runs are a clean no-op, not an error.
    console.log(`No export at ${file} — nothing to import (ship one via quant:score --json-out)`);
    process.exit(0);
  }

  console.log(`📥 import-ew-scores: reading ${file}`);

  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    console.error(`Malformed JSON in ${file}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  try {
    const result = await importEwScores(prisma, payload);
    console.log(`   as-of date:        ${result.asOfDate}`);
    console.log(`   imported (new):    ${result.imported}`);
    console.log(`   updated (upsert):  ${result.updated}`);
    console.log(`   skipped (no Ticker row / delisted): ${result.skippedUnknownTicker.length}`);
    if (result.skippedUnknownTicker.length > 0) {
      console.log(`      ${result.skippedUnknownTicker.slice(0, 10).join(', ')}${result.skippedUnknownTicker.length > 10 ? '…' : ''}`);
    }
    console.log(`   skipped (invalid): ${result.skippedInvalid.length}`);
    for (const s of result.skippedInvalid.slice(0, 10)) {
      console.log(`      ${s.symbol}: ${s.reason}`);
    }
    console.log('✅ done — snapshots are V5-B current-data scores (EARNINGS may be BLOCKED)');
  } catch (err) {
    if (err instanceof ExportValidationError) {
      console.error(`Invalid export: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('import-ew-scores failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
