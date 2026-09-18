/**
 * Early Winners — CURRENT-DATA SIGNAL CLI (V5-B MODE)
 * =====================================================
 *
 * Scores the frozen universe at an as-of date using the data available in
 * the local PIT database (SEC fundamentals + prices). This is the V5-B
 * configuration of the frozen engine — the ONLY empirically validated
 * variant (frozen OOS benchmark: Pearson +0.0984, spread +14.03%).
 *
 * ⚠ THIS IS NOT THE V5-C BACKTEST.
 * Without historical point-in-time analyst consensus data (not acquired —
 * documented research limitation), the EARNINGS category is BLOCKED and
 * the score is computed from FUNDAMENTALS + MOMENTUM + QUALITY only.
 * Do NOT present this output as evidence of V5-C performance.
 *
 * Usage:
 *   npm run quant:score -- --as-of 2025-09-30 [--top 20] [--universe manifest.json] [--limit N] [--json-out file.json]
 *
 * --json-out writes a stable export (contract "ew-score-export/1") consumed
 * by scripts/import-ew-scores.ts on the PreMarketPrice app side. The export
 * is a product-data handoff — NOT a V5-C research artifact.
 *
 * Environment:
 *   QUANT_DB_URL — PostgreSQL connection string for the PIT database
 *   (default: postgresql://postgres:postgres@localhost:54320/postgres)
 */

import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { EwEngine } from './scoring-engine';
import {
  UniverseManifest,
  universeSecurityIds,
} from '../p4-engine/consensus/universe-manifest';

const DEFAULT_UNIVERSE_PATH = 'data/quant/processed/v5b-universe-manifest.json';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const asOf = opt('--as-of');
  if (!asOf || isNaN(new Date(asOf).getTime())) {
    console.error(
      'Usage: npm run quant:score -- --as-of <YYYY-MM-DD> [--top 20] [--universe manifest.json] [--limit N]',
    );
    process.exit(2);
  }

  const universePath = opt('--universe') ?? DEFAULT_UNIVERSE_PATH;
  if (!fs.existsSync(universePath)) {
    console.error(
      `Universe manifest not found: ${universePath}\n` +
      `Pass --universe <manifest.json> or regenerate ${DEFAULT_UNIVERSE_PATH}`,
    );
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(universePath, 'utf-8')) as UniverseManifest;
  const limit = parseInt(opt('--limit') ?? '0', 10);
  let securityIds = [...universeSecurityIds(manifest)];
  if (limit > 0) securityIds = securityIds.slice(0, limit);
  const nameById = new Map(manifest.securities.map(s => [s.securityId, s.ticker]));

  const { PrismaClient } = await import('../p4-engine/db/client');
  const prisma = new PrismaClient();

  try {
    const engine = new EwEngine(prisma);
    const result = await engine.scoreUniverse(securityIds, new Date(asOf).toISOString());

    let earningsAvailable = 0;
    for (const r of result.rankedScores) {
      const e = r.score.categoryScores.EARNINGS;
      if (!e.isBlocked && e.availableFeatureCount > 0) earningsAvailable++;
    }

    console.log('EARLY WINNERS — CURRENT-DATA SIGNAL');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('⚠ CURRENT DATA — NOT A PIT BACKTEST — NOT V5-C VALIDATION');
    console.log('  Scores use data available at the as-of date in the local PIT DB.');
    console.log('  Without historical consensus, EARNINGS is blocked → V5-B mode only.');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`as-of:                 ${asOf}`);
    console.log(`universe requested:    ${securityIds.length} securities`);
    console.log(`scored (PIT-gate OK):  ${result.rankedScores.length}`);
    console.log(`excluded:              ${result.universe.excludedSecurityIds.length}`);
    console.log(
      `EARNINGS available:    ${earningsAvailable}/${result.rankedScores.length} ` +
      `(consensus features ${earningsAvailable === 0 ? 'BLOCKED — no PIT consensus data' : 'present'})`,
    );

    const jsonOut = opt('--json-out');
    if (jsonOut) {
      const payload = {
        contractVersion: 'ew-score-export/1',
        mode: 'V5-B',
        disclaimer:
          'Current-data score (V5-B methodology). NOT a backtested V5-C result. ' +
          'Historical V5-C performance has not been established.',
        asOfDate: asOf,
        engineVersion: result.rankedScores[0]?.score.engineVersion ?? 'unknown',
        universe: {
          requested: securityIds.length,
          scored: result.rankedScores.length,
          excluded: result.universe.excludedSecurityIds.length,
        },
        scores: result.rankedScores.map(r => ({
          symbol: nameById.get(r.securityId) ?? r.securityId,
          securityId: r.securityId,
          rank: r.rank,
          totalScore: r.score.totalScore,
          maxPossible: r.score.maxPossibleScore,
          pitGatePassed: r.score.pitGatePassed,
          categories: Object.fromEntries(
            Object.values(r.score.categoryScores).map(c => [
              c.category,
              {
                rawScore: c.rawScore,
                weightedScore: c.weightedScore,
                isBlocked: c.isBlocked,
                isPartial: c.isPartial,
              },
            ]),
          ),
          evidence: r.score.features
            .filter(f => f.value !== null && f.availability === 'AVAILABLE')
            .map(f => ({
              key: f.key,
              category: f.category,
              value: f.value,
              formula: f.evidence.formula,
              inputs: f.evidence.inputs,
              notes: f.evidence.notes,
              source: f.source,
            })),
        })),
      };
      fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2));
      console.log('');
      console.log(`export written:        ${jsonOut} (${payload.scores.length} rows, contract ew-score-export/1)`);
    }

    const top = Math.min(parseInt(opt('--top') ?? '20', 10), result.rankedScores.length);
    console.log('');
    console.log(`TOP ${top} BY TOTAL SCORE`);
    console.log('──────────────────────────────────────────────────────────────────────');
    for (const r of result.rankedScores.slice(0, top)) {
      const ticker = nameById.get(r.securityId) ?? r.securityId;
      const cats = Object.values(r.score.categoryScores)
        .map(c => `${c.category.slice(0, 3)}:${c.isBlocked ? 'BLK' : (c.rawScore?.toFixed(0) ?? 'n/a')}`)
        .join(' ');
      console.log(
        `  ${String(r.rank).padStart(3)}  ${ticker.padEnd(8)} ${r.score.totalScore.toFixed(1).padStart(6)}  ${cats}`,
      );
    }
    console.log('');
    console.log('REMINDER: valid methodology output (V5-B mode), NOT a claim of');
    console.log('future returns and NOT the unvalidated V5-C consensus variant.');
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(err => {
    console.error(
      'quant:score failed:',
      err instanceof Error ? err.message : err,
      '\n(requires QUANT_DB / a populated PIT database — no data was fabricated)',
    );
    process.exit(1);
  });
}
