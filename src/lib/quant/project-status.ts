/**
 * Early Winners / V5-C — Project Status Report
 * ==============================================
 *
 * Generates the definitive project status from the frozen constants in the
 * codebase — nothing is hard-coded here that could drift from the frozen
 * contracts. The report states honestly what is validated and what is not.
 *
 * Decided 2026-09: external historical PIT consensus data will NOT be
 * acquired. Its absence is a documented research limitation, not a
 * development blocker. The vendor-neutral ingest path remains in the
 * codebase as an optional future extension point.
 */

import {
  V5B_BENCHMARK,
  FROZEN_GO_NO_GO,
} from './p4-engine/consensus/v5c-oos-harness';
import { FROZEN_AUDIT_THRESHOLDS } from './p4-engine/consensus/empirical-pit-audit';
import { FROZEN_V5B_UNIVERSE } from './p4-engine/consensus/universe-manifest';
import { FROZEN_OOS_WINDOW } from './p4-engine/consensus/oos-coverage';
import { CATEGORY_WEIGHTS } from './ew-engine/types';

export interface ProjectStatus {
  implementation: 'COMPLETE';
  frozenMethodology: 'LOCKED';
  universe: { securities: number; tickers: number; terminatedHistories: number };
  weights: { earnings: number; fundamentals: number; momentum: number; quality: number };
  oosWindow: { start: string; end: string };
  auditThresholds: { universePct: number; windowPct: number; maxMissingMeanPct: number };
  goNoGo: { minPearsonImprovement: number; minSpreadImprovementPp: number; minConsensusCoveragePct: number };
  v5bBenchmark: { pearson: number; spreadPct: number; observations: number; securities: number };
  historicalPitData: 'NOT AVAILABLE';
  v5cOosValidation: 'NOT RUN';
  predictiveEdge: 'NOT ESTABLISHED';
  currentDataMode: 'AVAILABLE (requires QUANT_DB)';
  verdict: string;
}

export function buildProjectStatus(): ProjectStatus {
  return {
    implementation: 'COMPLETE',
    frozenMethodology: 'LOCKED',
    universe: {
      securities: FROZEN_V5B_UNIVERSE.securities,
      tickers: FROZEN_V5B_UNIVERSE.distinctTickers,
      terminatedHistories: FROZEN_V5B_UNIVERSE.delistedOrEndedTickers,
    },
    weights: {
      earnings: CATEGORY_WEIGHTS.EARNINGS * 100,
      fundamentals: CATEGORY_WEIGHTS.FUNDAMENTALS * 100,
      momentum: CATEGORY_WEIGHTS.MOMENTUM * 100,
      quality: CATEGORY_WEIGHTS.QUALITY * 100,
    },
    oosWindow: { start: FROZEN_OOS_WINDOW.start, end: FROZEN_OOS_WINDOW.end },
    auditThresholds: {
      universePct: FROZEN_AUDIT_THRESHOLDS.minUniverseCoveragePct,
      windowPct: FROZEN_AUDIT_THRESHOLDS.minWindowCoveragePct,
      maxMissingMeanPct: FROZEN_AUDIT_THRESHOLDS.maxMissingMeanPct,
    },
    goNoGo: {
      minPearsonImprovement: FROZEN_GO_NO_GO.minPearsonImprovement,
      minSpreadImprovementPp: FROZEN_GO_NO_GO.minSpreadImprovementPp,
      minConsensusCoveragePct: FROZEN_GO_NO_GO.minConsensusCoveragePct,
    },
    v5bBenchmark: {
      pearson: V5B_BENCHMARK.pearson,
      spreadPct: V5B_BENCHMARK.spreadPct,
      observations: V5B_BENCHMARK.observations,
      securities: V5B_BENCHMARK.securities,
    },
    historicalPitData: 'NOT AVAILABLE',
    v5cOosValidation: 'NOT RUN',
    predictiveEdge: 'NOT ESTABLISHED',
    currentDataMode: 'AVAILABLE (requires QUANT_DB)',
    verdict: 'PROJECT COMPLETE — EMPIRICAL V5-C VALIDATION NOT ESTABLISHED',
  };
}

export function formatProjectStatus(s: ProjectStatus = buildProjectStatus()): string {
  const w = s.weights;
  return [
    'EARLY WINNERS / V5-C — PROJECT STATUS',
    '══════════════════════════════════════════════════════════════════════',
    '',
    'IMPLEMENTATION',
    '──────────────',
    `  Software engine:        ${s.implementation}`,
    `  Frozen methodology:     ${s.frozenMethodology} (weights ${w.earnings}/${w.fundamentals}/${w.momentum}/${w.quality})`,
    `  OOS window (frozen):    ${s.oosWindow.start} → ${s.oosWindow.end}`,
    `  Universe (frozen):      ${s.universe.securities} securities / ${s.universe.tickers} tickers / ${s.universe.terminatedHistories} terminated histories`,
    `  Audit gates (frozen):   universe ≥${s.auditThresholds.universePct}% · window ≥${s.auditThresholds.windowPct}% · null-mean ≤${s.auditThresholds.maxMissingMeanPct}%`,
    `  Go/No-Go rule (frozen): V5-C must strictly beat V5-B Pearson AND spread, coverage ≥${s.goNoGo.minConsensusCoveragePct}%`,
    '',
    'V5-B BENCHMARK (SEC-only variant — empirically validated OOS)',
    '──────────────────────────────────────────────────────────────',
    `  Pearson:  +${s.v5bBenchmark.pearson.toFixed(4)}`,
    `  Spread:   +${s.v5bBenchmark.spreadPct.toFixed(2)}%`,
    `  Obs:      ${s.v5bBenchmark.observations} across ${s.v5bBenchmark.securities} securities`,
    '',
    'REAL HISTORICAL PIT CONSENSUS DATA',
    '──────────────────────────────────',
    `  Historical consensus:   ${s.historicalPitData} (acquisition declined — research limitation)`,
    `  V5-C OOS validation:    ${s.v5cOosValidation}`,
    `  Predictive edge:        ${s.predictiveEdge}`,
    '',
    'CURRENT-DATA MODE',
    '─────────────────',
    `  ${s.currentDataMode} — scores the frozen universe on SEC + price data`,
    '  (V5-B mode; EARNINGS consensus features BLOCKED without PIT data).',
    '  NOT a V5-C backtest. Command: npm run quant:score -- --as-of <date>',
    '',
    'REPRODUCE VALIDATED PARTS (no vendor credentials needed)',
    '──────────────────────────────────────────────────────────',
    '  npm run test:quant      full quant suite (incl. frozen-contract guard)',
    '  npm run quant:e2e       synthetic end-to-end (labeled — not research)',
    '  npm run quant:status    this report',
    '',
    'STATUS',
    '──────',
    `  ${s.verdict}`,
  ].join('\n');
}
