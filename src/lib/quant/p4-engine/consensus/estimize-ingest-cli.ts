/**
 * Estimize Ingest CLI
 * ====================
 *
 * Wires together: CSV parsing → adapter → transform → PIT validation → DB.
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
import {
  buildFactRows,
  buildRevisionRows,
  buildReport,
} from './estimize-ingest';
import {
  validateConsensusFacts,
  validateConsensusRevisions,
  buildCoverageReport,
} from './pit-consensus-validator';
import {
  QuarantineEntry,
  TickerResolver,
} from './consensus-ingest-types';

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

  const { PrismaClient } = await import('./db/client');
  const prisma = new PrismaClient();

  try {
    // ─── Ticker resolver (PIT-correct over PitTickerHistory) ───
    const tickerRows = await prisma.pitTickerHistory.findMany({
      select: { ticker: true, securityId: true, startDate: true, endDate: true },
    });
    const resolver: TickerResolver = {
      resolve(ticker: string, at: Date): string | null {
        const t = ticker.toUpperCase();
        const atMs = at.getTime();
        const match = tickerRows.find(
          r =>
            r.ticker.toUpperCase() === t &&
            r.startDate.getTime() <= atMs &&
            (r.endDate === null || atMs < r.endDate.getTime()),
        );
        return match ? match.securityId : null;
      },
    };

    const adapter = new EstimizeConsensusAdapter();
    const quarantine: QuarantineEntry[] = [];

    // ─── Step 1: Parse consensus CSV → canonical snapshots ───
    const consensusRows = parseConsensusCsv(args[0]);
    const snapshots = adapter.parseSnapshots(consensusRows);
    if (!snapshots || snapshots.length === 0) {
      console.error('FATAL: parseSnapshots returned null/empty — CSV format invalid?');
      process.exit(1);
    }

    // ─── Step 2: Transform → DB-ready fact rows ───
    const factRows = buildFactRows(snapshots, resolver, quarantine);

    // ─── Step 3: PIT validation — HARD FAIL on leakage ───
    const factValidation = validateConsensusFacts(factRows);
    if (!factValidation.passed) {
      console.error('⛔ PIT VALIDATION FAILED — leakage detected. Ingest aborted.');
      for (const e of factValidation.errors) console.error(`  ${e}`);
      process.exit(1);
    }

    // ─── Step 4: Write facts (idempotent by sourceRecordHash) ───
    let factsInserted = 0;
    let factDuplicates = 0;
    for (const row of factRows) {
      const existing = await prisma.pitConsensusFact.findFirst({
        where: { sourceRecordHash: row.sourceRecordHash },
        select: { id: true },
      });
      if (existing) { factDuplicates++; continue; }
      await prisma.pitConsensusFact.create({
        data: {
          securityId: row.securityId,
          fiscalYear: row.fiscalYear,
          fiscalPeriod: row.fiscalPeriod,
          periodEndDate: row.periodEndDate,
          observationDate: row.observationDate,
          availableAt: row.availableAt,
          supersededAt: row.supersededAt ?? new Date('9999-12-31T23:59:59Z'),
          metricType: row.metricType,
          consensusMean: row.consensusMean,
          consensusMedian: row.consensusMedian,
          consensusHigh: row.consensusHigh,
          consensusLow: row.consensusLow,
          consensusStdDev: row.consensusStdDev,
          analystCount: row.analystCount,
          actualValue: row.actualValue,
          actualReportDate: row.actualReportDate,
          sourceProvider: row.sourceProvider,
          sourceType: row.sourceType,
          sourceRecordHash: row.sourceRecordHash,
        },
      });
      factsInserted++;
    }

    // ─── Step 5: Revisions (optional second file) ───
    let revisionsInserted = 0;
    let revisionDuplicates = 0;
    if (args[1]) {
      const estimateRows = parseEstimatesCsv(args[1]);
      const revisionEvents = adapter.parseRevisions(estimateRows);
      if (revisionEvents) {
        const revisionRows = buildRevisionRows(revisionEvents, resolver, quarantine);

        const revValidation = validateConsensusRevisions(revisionRows);
        if (!revValidation.passed) {
          console.error('⛔ REVISION VALIDATION FAILED — ingest aborted.');
          for (const e of revValidation.errors) console.error(`  ${e}`);
          process.exit(1);
        }

        for (const row of revisionRows) {
          const existing = await prisma.pitConsensusRevision.findFirst({
            where: { sourceRecordHash: row.sourceRecordHash },
            select: { id: true },
          });
          if (existing) { revisionDuplicates++; continue; }
          await prisma.pitConsensusRevision.create({
            data: {
              securityId: row.securityId,
              fiscalYear: row.fiscalYear,
              fiscalPeriod: row.fiscalPeriod,
              periodEndDate: row.periodEndDate,
              revisionDate: row.revisionDate,
              availableAt: row.availableAt,
              analystId: row.analystId,
              analystName: row.analystName,
              metricType: row.metricType,
              priorEstimate: row.priorEstimate,
              newEstimate: row.newEstimate,
              sourceProvider: row.sourceProvider,
              sourceType: row.sourceType,
              sourceRecordHash: row.sourceRecordHash,
            },
          });
          revisionsInserted++;
        }
      }
    }

    // ─── Report ───
    const report = buildReport(consensusRows.length, factsInserted, factDuplicates, quarantine, factRows);
    console.log('=== Estimize Consensus Ingest Report ===');
    console.log(`Raw CSV rows:          ${report.rawCount}`);
    console.log(`Canonical snapshots:   ${snapshots.length}`);
    console.log(`Facts inserted:        ${report.acceptedCount}`);
    console.log(`Duplicates skipped:    ${report.duplicateCount}`);
    console.log(`Quarantined:           ${report.quarantinedCount}`);
    console.log(`Securities covered:    ${report.securitiesCovered}`);
    console.log(`Date range:            ${report.dateRange.min?.toISOString() ?? 'n/a'} → ${report.dateRange.max?.toISOString() ?? 'n/a'}`);
    if (args[1]) {
      console.log(`Revisions inserted:    ${revisionsInserted}`);
      console.log(`Revision duplicates:   ${revisionDuplicates}`);
    }
    if (quarantine.length > 0) {
      console.log('\nQuarantine entries (first 20):');
      for (const q of quarantine.slice(0, 20)) console.log(`  [${q.reason}] ${q.detail}`);
      if (quarantine.length > 20) console.log(`  ... and ${quarantine.length - 20} more`);
    }
    console.log('\nCoverage:');
    console.log(JSON.stringify(buildCoverageReport(factRows), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
