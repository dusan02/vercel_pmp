# V5 Consensus Vendor Gate — Decision Report

**Date**: 2026-09-13
**Status**: Decision made — Estimize selected
**Blocks**: V5-C/D OOS test, production EarlyWinner ranking decision

---

## Context

V5-B SEC-only OOS test passed (Pearson +0.0984, spread +14.03% vs P0.8 baseline
Pearson -0.0374, spread -2.86%, 23,941 observations, 589 securities).

V5 framework is FROZEN. No further feature engineering. The only remaining gate
is consensus data: does historical analyst consensus add predictive value beyond
SEC fundamentals?

The gate requires **genuine point-in-time consensus snapshots/revisions** with a
`knownAt` timestamp — not current consensus back-mapped to historical prices
(which would be look-ahead bias).

---

## Vendor Evaluation

### 1. Estimize — SELECTED

| Criterion | Value |
|---|---|
| PIT data | ✅ Explicit — "We never delete estimates or change estimates" |
| `knownAt` field | `created_at` (estimates), `updated_at` (consensus revisions), `Date` (CSV snapshots) |
| History | January 2012+ |
| Coverage | 3,000+ US equities and ADRs |
| Identifiers | Point-in-time ticker, CUSIP, instrument_id |
| API | `/releases/:id/consensus` returns full revision history with `updated_at` |
| CSV files | `Estimates.csv` (per-estimate, `created_at`), `Consensus.csv` (daily snapshot, `Date` = PIT) |
| Pricing | Free trial for historical CSV; $249/mo Premium Plus (API); Institutional = quote |
| Free trial | ✅ Historical testing files available at no cost |

**Key quote (Estimize FAQ)**:
> "We keep point-in-time data for all estimates contributed to the platform.
> We never delete estimates or change estimates. The sanctity of this data is
> extremely important to us because our clients need to be able to trust that
> the historical data they are backtesting is what they would have seen at the
> time in production."

**Schema mapping**:
- `Consensus.csv::Date` → `ConsensusObservation.observationDate` (PIT knowledge timestamp)
- `Consensus.csv::Estimize.eps.weighted` → `ConsensusObservation.consensusValue`
- `Consensus.csv::Estimize.eps.count` → `ConsensusObservation.analystCount`
- `Estimates.csv::created_at` → individual estimate `knownAt`
- `Estimates.csv::Point_in_time_ticker` → security mapping at observation time

### 2. Zacks Direct (zacksdata.com) — Backup

| Criterion | Value |
|---|---|
| PIT data | ✅ "Point-in-Time Accuracy" — historized records |
| History | Annual EPS 1979, quarterly EPS 1982, recommendations 1985, sales/targets 2000 |
| Coverage | 5,000+ US and Canadian companies |
| Delivery | API (XML/JSON), bulk CSV, SFTP |
| Pricing | Enterprise — contact sales (no public pricing, likely $$$) |

Gold standard for PIT consensus, but enterprise contract is a barrier for a solo
project. Revisit if Estimize proves insufficient.

### 3. Intrinio (Zacks data via API) — Ruled out (unclear PIT)

- Analyst ratings: PIT via `snapshot_date` parameter ✅
- EPS/Sales estimates: `date` field = period end date, NOT `knownAt` ❌
- Likely returns current consensus for historical periods, not historical snapshots
- Would need to verify with free trial before committing

### 4. Nasdaq Data Link (NDL) — Ruled out

- `ZACKS/EE`: current consensus only, updated daily — NOT PIT
- `ZACKS/EREV`: "recent" revisions — rolling window, not full historical archive
- Free tier (which we have, key `s9Tes3zRrCuJUNL87Kdx`): current only
- Premium tier: still recent-only, not full PIT history
- This matches the finding already encoded in `vendor-adapter.ts:237`

---

## Decision: Estimize

### Rationale

1. PIT is their explicit core value prop — not a side feature
2. Timestamps map 1:1 to our `CanonicalConsensusSnapshot` schema
3. Free trial lets us validate PIT quality before paying
4. $249/mo API is accessible for a solo project
5. History back to 2012 covers the V5-B OOS test period
6. 3,000+ equities covers our 589-security universe
7. API `/releases/:id/consensus` returns full revision history — backfill via API is feasible

### Implementation plan

1. **Sign up for Estimize free trial** → download historical CSV files (Estimates.csv + Consensus.csv)
2. **Validate PIT quality** — verify `Date` column, `created_at`, revision chains, no look-ahead
3. **Implement `EstimizeConsensusAdapter.parseSnapshots()`** — map Estimize CSV → `CanonicalConsensusSnapshot`
4. **Ingest into PIT DB** — `ConsensusObservation` with `observationDate` = Estimize `Date`/`updated_at`
5. **Unblock `ConsensusEarningsProvider`** — implement real `computeFeatures()` using PIT consensus
6. **Run V5-C OOS** (SEC + consensus) vs V5-B benchmark
7. **Compare Pearson + spread** — decide if consensus adds predictive value
8. **If yes**: V5-C becomes production EarlyWinner ranking
9. **If no**: V5-B SEC-only becomes production, consensus path closed

### What we will NOT do

- Use free NDL/Zacks current consensus as a historical PIT source (look-ahead bias)
- Add new features to the FROZEN V5 framework
- Tune weights based on OOS results (overfitting)
- Use Estimize Wall Street consensus (that's sell-side, not the Estimize crowdsourced consensus)

---

## References

- Estimize API docs: https://www.estimize.com/api_docs/v1
- Estimize data dictionary: http://www.estimize.com/data_dictionary
- Estimize data access FAQ: http://www.estimize.com/data_access_faq
- Zacks Data: https://zacksdata.com/datasets/consensus-data/
- NDL ZEE: https://data.nasdaq.com/databases/ZEE
- NDL ZREV: https://data.nasdaq.com/databases/ZREV
- Intrinio pricing: https://intrinio.com/pricing
- Code: `src/lib/quant/p4-engine/consensus/vendor-adapter.ts` (adapter skeletons)
- Code: `src/lib/quant/p5/earnings-contract.ts` (canonical schema)
- Code: `src/lib/quant/ew-engine/providers/consensus-earnings.ts` (blocked provider)
