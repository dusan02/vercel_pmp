# V5-C Readiness Status — Project Complete, Research Limitation Documented

> **Final decision (2026-09-18):** external historical PIT consensus data
> will NOT be acquired. This document records the completed engineering
> state. The definitive project report is **`v5c-final-status.md`**.
>
> This is NOT a vendor-blocked project — it is a finished research
> implementation with an explicitly unvalidated empirical hypothesis.

## Status model

| Layer | Status |
|---|---|
| Methodology | COMPLETE — frozen, guarded by `frozen-contracts.test.ts` |
| Implementation | COMPLETE — 226/226 tests, scoped strict typecheck clean |
| Data pipeline | COMPLETE — vendor-neutral, executes end-to-end |
| Historical PIT data | NOT AVAILABLE — research limitation (acquisition declined) |
| V5-C OOS validation | NOT VALIDATED — never run on real data |
| Predictive edge | NOT ESTABLISHED |

## Frozen contracts (unchanged)

| Item | Value |
|---|---|
| Methodology | V5-C frozen — weights 35/30/25/10, no tuning |
| V5-B OOS window | `2023-06-18 → 2025-09-30` (TEST split of frozen baseline) |
| V5-B universe | 575 securities / 575 tickers / 173 terminated ticker histories |
| Observation grid | monthly |
| GO/NO-GO | `decideGoNoGo` — Pearson AND spread must strictly beat V5-B, coverage ≥ 60% |
| Data gates | universe ≥ 60%, window ≥ 80%, missing mean ≤ 5% (`FROZEN_AUDIT_THRESHOLDS`) |
| Benchmark | `V5B_BENCHMARK` — Pearson +0.0984, spread +14.03% (V5-B, not V5-C) |

## What is executable today (no vendor credentials)

```
npm run test:quant      # full quant suite incl. frozen-contract guard
npm run quant:e2e       # synthetic end-to-end — SYNTHETIC, not research
npm run quant:status    # definitive project status report
npm run quant:score -- --as-of <date>   # current-data signal (V5-B mode, needs QUANT_DB)
```

Pipeline modules (all vendor-neutral):

- `canonical-ingest.ts` — vendor-neutral ingest + `InMemoryConsensusStore`
- `prisma-consensus-store.ts` — DB store + `buildTickerResolver` (PIT-correct)
- `actuals-source.ts` — `PitActualsSource` interface + `SecActualsSource`
- `universe-manifest.ts` — frozen-universe manifest types + validation;
  `diffUniverse`/`formatUniverseDiff` (Expected/Observed/Matched/Missing/Unexpected)
- `oos-coverage.ts` — monthly OOS coverage checker (frozen window default)
- `eeh-profiler.ts` + `eeh-profiler-cli.ts` — read-only CSV profiler;
  ambiguous/missing required columns → explicit SCHEMA GATE STOP
- `empirical-pit-audit.ts` — frozen gates + record classification
- `synthetic-e2e-pipeline.ts` + `synthetic-e2e-cli.ts` — labeled demo
- `frozen-contracts.test.ts` — regression guard for every frozen constant

## PIT timing contract (encoded in tests)

`pit-timing.test.ts` encodes the two-timestamp contract: usable at T iff
`observationDate <= T AND availableAt <= T` (inclusive). A snapshot
observed earlier but available later is invisible until available.

## Vendor ingestion — optional future extension point

The vendor-neutral interfaces (canonical snapshots, PIT validator,
profiler, `EstimizeConsensusAdapter`, `PrismaConsensusStore`,
actuals source) remain in the codebase. They are **not a current
dependency** — they are the documented acceptance path IF a historical
PIT dataset is ever reconsidered. The evaluation contract lives in
`v5c-data-requirements.md`.

## Synthetic data warning

Everything in `__fixtures__/`, `v5c-e2e.test.ts`, `synthetic-e2e-pipeline.ts`
and `quant:e2e` is **SYNTHETIC TEST DATA**. It proves the pipeline executes
and is deterministic — it is NOT evidence of predictive performance and
must never be cited as a V5-C result.
