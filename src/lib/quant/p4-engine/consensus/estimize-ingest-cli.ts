/**
 * Estimize Ingest CLI
 * ====================
 *
 * Wires together: CSV parsing → adapter → vendor-neutral canonical ingest
 * (normalization → PIT validation → idempotent DB write).
 *
 * Aborts (exit 1) on any PIT leakage — hard failure, never a warning.
 *
 * Usage:
 *   npx tsx src/lib/quant/p4-engine/consensus/estimize-ingest-cli.ts <consensus.csv> [estimates.csv]
 *
 * Environment:
 *   QUANT_DB_URL — PostgreSQL connection string for the PIT database
 */

import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { EstimizeConsensusAdapter } from './vendor-adapter';
import { runCanonicalIngest } from './canonical-ingest';
import { PrismaConsensusStore, buildTickerResolver } from './prisma-consensus-store';

// ─── CSV cell coercion ───────────────────────────────────────────────────────

function num(v: string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function int(v: string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function parseConsensusCsv(path: string): Record<string, unknown>[] {
  const text = fs.readFileSync(path, 'utf-8');
  const raw: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true });
  return raw.map(r => ({
    Date: r['Date'],
    Ticker: r['Ticker'],
    Cusip: r['Cusip'],
    Instrument_id: r['Instrument_id'],
    Instrument_name: r['Instrument_name'],
    Fiscal_year: int(r['Fiscal_year']),
    Fiscal_quarter: int(r['Fiscal_quarter']),
    Reports_at: r['Reports_at'],
    'Estimize.eps.weighted': num(r['Estimize.eps.weighted']),
    'Estimize.eps.high': num(r['Estimize.eps.high']),
    'Estimize.eps.low': num(r['Estimize.eps.low']),
    'Estimize.eps.sd': num(r['Estimize.eps.sd']),
    'Estimize.eps.count': int(r['Estimize.eps.count']),
    'Estimize.revenue.weighted': num(r['Estimize.revenue.weighted']),
    'Estimize.revenue.high': num(r['Estimize.revenue.high']),
    'Estimize.revenue.low': num(r['Estimize.revenue.low']),
    'Estimize.revenue.sd': num(r['Estimize.revenue.sd']),
    'Estimize.revenue.count': int(r['Estimize.revenue.count']),
    'Reported.eps': num(r['Reported.eps']),
    'Reported.revenue': num(r['Reported.revenue']),
  }));
}

function parseEstimatesCsv(path: string): Record<string, unknown>[] {
  const text = fs.readFileSync(path, 'utf-8');
  const raw: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true });
  return raw.map(r => ({
    Estimate_id: r['Estimate_id'],
    Eps: num(r['Eps']),
    Revenue: num(r['Revenue']),
    Created_at: r['Created_at'],
    Flagged: r['Flagged'] === 'true' || r['Flagged'] === 'TRUE',
    Release_id: r['Release_id'],
    Fiscal_quarter: int(r['Fiscal_quarter']),
    Fiscal_year: int(r['Fiscal_year']),
    Reported_eps: num(r['Reported.eps']),
    Reported_revenue: num(r['Reported.revenue']),
    Reports_at: r['Reports_at'],
    Point_in_time_ticker: r['Point_in_time_ticker'],
    Point_in_time_cusip: r['Point_in_time_cusip'],
    Analyst_id: r['Analyst_id'],
    Username: r['Username'],
  }));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: npx tsx .../estimize-ingest-cli.ts <consensus.csv> [estimates.csv]');
    process.exit(1);
  }

  const { PrismaClient } = await import('../db/client');
  const prisma = new PrismaClient();

  try {
    const resolver = await buildTickerResolver(prisma);
    const store = new PrismaConsensusStore(prisma);
    const adapter = new EstimizeConsensusAdapter();

    // ─── Step 1: Parse consensus CSV → canonical snapshots ───
    const consensusPath = args[0]!;
    const consensusRows = parseConsensusCsv(consensusPath);
    const snapshots = adapter.parseSnapshots(consensusRows);
    if (!snapshots || snapshots.length === 0) {
      console.error('FATAL: parseSnapshots returned null/empty — CSV format invalid?');
      process.exit(1);
    }

    // ─── Step 2: Revisions (optional second file) ───
    let revisionEvents = null;
    const estimatesPath = args[1];
    if (estimatesPath) {
      revisionEvents = adapter.parseRevisions(parseEstimatesCsv(estimatesPath));
    }

    // ─── Step 3: Canonical ingest (normalize → validate → write) ───
    // runCanonicalIngest throws on PIT validation failure — hard abort.
    const manifest = await runCanonicalIngest(snapshots, revisionEvents, resolver, store);

    // ─── Report ───
    const report = manifest.report;
    console.log('=== Estimize Consensus Ingest Report ===');
    console.log(`Raw CSV rows:          ${report.rawCount}`);
    console.log(`Canonical snapshots:   ${snapshots.length}`);
    console.log(`Facts inserted:        ${manifest.factsInserted}`);
    console.log(`Duplicates skipped:    ${manifest.factDuplicates}`);
    console.log(`Quarantined:           ${report.quarantinedCount}`);
    console.log(`Securities covered:    ${report.securitiesCovered}`);
    console.log(`Date range:            ${report.dateRange.min?.toISOString() ?? 'n/a'} → ${report.dateRange.max?.toISOString() ?? 'n/a'}`);
    if (estimatesPath) {
      console.log(`Revisions inserted:    ${manifest.revisionsInserted}`);
      console.log(`Revision duplicates:   ${manifest.revisionDuplicates}`);
    }
    if (manifest.quarantine.length > 0) {
      console.log('\nQuarantine entries (first 20):');
      for (const q of manifest.quarantine.slice(0, 20)) console.log(`  [${q.reason}] ${q.detail}`);
      if (manifest.quarantine.length > 20) console.log(`  ... and ${manifest.quarantine.length - 20} more`);
    }

  } catch (err) {
    console.error('⛔ INGEST FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
