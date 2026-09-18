# Early Winners / V5-C — Final Project Status

**Verdict: PROJECT COMPLETE — EMPIRICAL V5-C VALIDATION NOT ESTABLISHED**

Date: 2026-09-18

---

## 1. Executive summary

**Early Winners** is a frozen quantitative equity-ranking methodology
(V5) evaluated against a PIT-correct (point-in-time) backtesting engine.
Two variants exist:

- **V5-B** — SEC fundamentals + price momentum only. **Empirically
  validated** on a frozen out-of-sample run (the benchmark below).
- **V5-C** — identical methodology + historical analyst-consensus
  features (EARNINGS category). **Implemented but NOT empirically
  validated** — the required historical PIT consensus dataset was not
  obtained, and a decision was made not to acquire it.

What was built: the complete vendor-neutral PIT data pipeline, feature
engine, scoring engine, OOS harness, empirical data-audit gates, and
regression suite. What was NOT demonstrated: any V5-C predictive edge.

**No claim is made about V5-C performance.**

## 2. Frozen methodology (unchanged)

- Category weights: **EARNINGS 35 / FUNDAMENTALS 30 / MOMENTUM 25 / QUALITY 10**
- Scoring: cross-sectional percentile ranks → category rawScore = mean of
  available-feature ranks → weighted total (rank-based, not threshold)
- PIT contract: a record is usable at T iff
  `observationDate <= T AND availableAt <= T` (inclusive)
- OOS window (frozen TEST split): **2023-06-18 → 2025-09-30**, monthly grid
- Go/No-Go (frozen): V5-C must **strictly beat** V5-B Pearson AND spread,
  with consensus coverage ≥ 60%
- Empirical data gates (frozen): universe coverage ≥ 60%, OOS-month
  coverage ≥ 80%, null consensus-mean ≤ 5%
- All constants are pinned by `frozen-contracts.test.ts` — any drift
  fails the suite.

## 3. Universe (frozen)

575 securities / 575 distinct tickers / 173 terminated-or-delisted
ticker histories. Reproduced deterministically from the PIT database
(`data/quant/processed/v5b-universe-manifest.json`, gitignored derived
artifact). Delisted names are mandatory — their absence would be
survivorship bias.

## 4. V5-B benchmark (empirically validated)

| Metric | Value |
|---|---|
| Pearson (score vs forward return) | **+0.0984** |
| Spread (top−bottom decile) | **+14.03%** |

This is the **V5-B** result — the SEC-only variant — preserved as the
frozen benchmark `V5B_BENCHMARK`. It is the only variant with a
completed OOS evaluation. (Provenance note: stored obs/security counts
trace to the earlier P0.8 artifact lineage; documented, deliberately
not rewritten.)

## 5. Engineering validation (demonstrated)

- `npm run test:quant` — **226/226 tests pass** (17 files)
- Scoped strict typecheck (`strict + noUncheckedIndexedAccess +
  exactOptionalPropertyTypes`) — **0 errors** across `consensus/` and
  `ew-engine/`
- PIT boundary tests: obs ≤ T + avail ≤ T usable; avail > T invisible;
  post-report actuals legitimate, pre-report actuals = hard-fail leakage
- Actuals boundary tests incl. source-failure vs no-actual distinction
- `frozen-contracts.test.ts` — pins benchmark, gates, window, universe,
  weights, Go/No-Go boundary semantics
- Synthetic E2E (`npm run quant:e2e`) — full pipeline executes
  deterministically end-to-end on labeled synthetic fixtures

## 6. Synthetic testing — scope statement

Synthetic data was used **only** to validate software behavior
(ingest paths, PIT reconstruction, audit diagnostics, OOS mechanics).
It is **not evidence of investment performance** and is labeled as such
in code, fixtures, tests, and CLI output.

## 7. Missing historical PIT data — research limitation

The intended V5-C experiment requires historical point-in-time analyst
consensus (each row = consensus state as of a historical observation
date, with availability semantics, including delisted securities).
This dataset was **not obtained**; the decision (2026-09-18) was to
complete the project without acquiring it.

Therefore:

- V5-C OOS was **never run on real data**
- No V5-C Pearson, spread, hit rate, or significance exists
- **No claim is made that V5-C predicts anything**

The vendor-neutral ingest interfaces (canonical snapshots, PIT
validator, profiler, adapters, actuals source) are retained as an
**optional future extension point** — documented in
`v5c-data-requirements.md` as the acceptance contract should a dataset
ever be reconsidered.

## 8. What can be concluded

**Demonstrated:**

- Software correctness within the tested contracts
- PIT reconstruction logic (obs ≤ T AND avail ≤ T)
- Deterministic scoring, frozen methodology implementation
- OOS machinery and Go/No-Go decision rule
- Data-audit gates and leakage detection
- V5-B benchmark (the SEC-only variant — see §4)

**Not demonstrated:**

- V5-C historical predictive edge
- V5-C OOS Pearson / spread / hit rate
- Statistical significance or economic profitability of the consensus
  signal

## 9. What the project can do today

- Score the frozen universe on **current SEC + price data** (V5-B mode,
  EARNINGS blocked without consensus): `npm run quant:score -- --as-of <date>`
  — requires the local PIT DB (`QUANT_DB_URL`)
- Ingest and validate any future PIT consensus extract through the
  frozen acceptance path (profiler → STOP → mapping → ingest → audit)
- Reproduce all validated behavior with zero vendor credentials:
  `npm run test:quant`, `npm run quant:e2e`, `npm run quant:status`

## 10. What would require historical PIT data in the future

Only the empirical branch: adapter mapping for a real extract →
canonical ingest → `runPitAudit` (frozen 60/80/5) → V5-C OOS →
`decideGoNoGo`. No further engineering is required to run it — only
the dataset.
