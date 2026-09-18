/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SYNTHETIC E2E DEMO — PIPELINE EXECUTION CHECK — NOT A RESEARCH RESULT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Demonstrates the COMPLETE vendor-neutral V5-C data path locally with the
 * labeled synthetic fixture — no vendor file, no Postgres, no network:
 *
 *   synthetic snapshots → canonical ingest → PIT validation →
 *   empirical audit (frozen thresholds) → OOS pass (stub engine) →
 *   frozen Go/No-Go report
 *
 * Usage:
 *   tsx src/lib/quant/p4-engine/consensus/synthetic-e2e-cli.ts [--out report.json] [--json]
 *
 * The output is SYNTHETIC. It proves the wiring executes and is
 * deterministic — it is NOT evidence of predictive performance and
 * MUST NOT be cited as a V5-C result.
 */

import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runSyntheticPipeline } from './synthetic-e2e-pipeline';
import { formatUniverseDiff, diffUniverse } from './universe-manifest';
import { SYNTHETIC_TICKER_HISTORY } from './__fixtures__/synthetic-pit-consensus';
import { UniverseManifest } from './universe-manifest';

function formatReport(r: Awaited<ReturnType<typeof runSyntheticPipeline>>): string {
  const m = r.manifest;
  const a = r.audit;
  const g = r.goNoGo;
  const lines: string[] = [];
  lines.push('═'.repeat(70));
  lines.push(`  ${r.label}`);
  lines.push('═'.repeat(70));
  lines.push('');
  lines.push('── INGEST ───────────────────────────────────────────────');
  lines.push(`  raw snapshots:              ${m.report.rawCount}`);
  lines.push(`  facts inserted:             ${m.factsInserted}`);
  lines.push(`  revisions inserted:         ${m.revisionsInserted}`);
  lines.push(`  zero-coverage excluded:     ${m.nonObservationRowsExcluded}`);
  lines.push(`  duplicates:                 ${m.factDuplicates}`);
  lines.push(`  quarantined:                ${m.quarantine.length}`);
  lines.push(`  validation errors/warns:    ${m.validation.factErrors}/${m.validation.factWarnings}`);
  lines.push('');
  lines.push('── EMPIRICAL PIT AUDIT (frozen thresholds 60/80/5) ──────');
  lines.push(`  facts / securities:         ${a.coverage.totalFacts} / ${a.coverage.securitiesCovered}`);
  lines.push(`  universe coverage:          ${a.coverage.universeCoveragePct.toFixed(1)}% of ${a.coverage.universeSize}`);
  lines.push(`  OOS months covered:         ${a.window.monthsCovered}/${a.window.monthsTotal} (${a.window.windowCoveragePct.toFixed(1)}%)`);
  lines.push(`  null consensus mean:        ${a.missingness.nullConsensusMeanPct.toFixed(1)}%`);
  lines.push(`  classification:             valid=${a.classification.valid} nullCov=${a.classification.nullMeanWithCoverage} zeroCov=${a.classification.zeroCoverageLike} malformed=${a.classification.malformed} late=${a.classification.lateAvailability} future=${a.classification.futureObservation}`);
  lines.push(`  audit gate:                 ${a.passed ? 'PASS' : 'FAIL'}`);
  for (const f of a.gateFailures) lines.push(`    - ${f}`);
  lines.push('');
  lines.push('── OOS PASS (stub engine) ───────────────────────────────');
  lines.push(`  observations:               ${r.oos.metrics.observations}`);
  lines.push(`  pearson:                    ${r.oos.metrics.pearson?.toFixed(4) ?? 'n/a'}`);
  lines.push(`  spread:                     ${r.oos.metrics.spreadPct?.toFixed(2) ?? 'n/a'}%`);
  lines.push(`  consensus coverage:         ${r.oos.consensusCoveragePct.toFixed(1)}%`);
  lines.push('');
  lines.push('── GO/NO-GO (frozen rule vs V5-B benchmark) ─────────────');
  lines.push(`  decision:                   ${g.decision}  ⚠ SYNTHETIC — carries NO research meaning`);
  for (const reason of g.reasons) lines.push(`    - ${reason}`);
  lines.push('');
  lines.push('REMINDER: all inputs above are SYNTHETIC TEST DATA.');
  lines.push('This output is NOT a V5-C research result.');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const result = await runSyntheticPipeline();

  // Universe diff against synthetic ticker set (demo diagnostics)
  const synUniverse: UniverseManifest = {
    name: 'SYNTHETIC-UNIVERSE',
    generatedAt: 'SYNTHETIC',
    source: 'SYNTHETIC FIXTURE',
    reproduces: 'N/A',
    oosWindow: { start: '2023-06-18', end: '2025-09-30' },
    counts: {
      securities: SYNTHETIC_TICKER_HISTORY.length,
      distinctTickers: SYNTHETIC_TICKER_HISTORY.length,
      delistedOrEndedTickers: SYNTHETIC_TICKER_HISTORY.filter(t => t.endDate !== null).length,
    },
    securities: SYNTHETIC_TICKER_HISTORY.map(t => ({
      securityId: t.securityId,
      ticker: t.ticker,
      startDate: t.startDate.toISOString().slice(0, 10),
      endDate: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
      exchange: null,
      delisted: t.endDate !== null,
    })),
  };
  const observedTickers = result.store.facts.map(f => {
    const row = SYNTHETIC_TICKER_HISTORY.find(t => t.securityId === f.securityId);
    return row?.ticker ?? f.securityId;
  });
  const diff = diffUniverse(synUniverse, observedTickers);

  const out = opt('--out');
  if (out) {
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          label: result.label,
          manifest: result.manifest,
          audit: result.audit,
          oos: result.oos,
          goNoGo: result.goNoGo,
          universeDiff: diff,
        },
        null,
        2,
      ) + '\n',
    );
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify({ label: result.label, audit: result.audit, oos: result.oos, goNoGo: result.goNoGo }, null, 2));
  } else {
    console.log(formatReport(result));
    console.log('\n── UNIVERSE DIFF (synthetic) ────────────────────────────');
    console.log(formatUniverseDiff(diff));
    if (out) console.log(`\nJSON report written: ${out}`);
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(err => {
    console.error('synthetic-e2e failed:', err);
    process.exit(1);
  });
}
