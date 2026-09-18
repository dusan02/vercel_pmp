# V5-C Minimum Dataset Requirements — Future Extension Spec

> **Status (2026-09-18):** external historical PIT data acquisition was
> DECLINED. This document is retained as the acceptance contract IF a
> dataset is ever reconsidered — it is not an active acquisition plan.
>
> Derived from the frozen pipeline code (`canonical-ingest.ts`,
> `consensus-ingest-types.ts`, `consensus-feature-calculators.ts`,
> `pit-consensus-validator.ts`, `empirical-pit-audit.ts`,
> `oos-coverage.ts`, `v5c-oos-harness.ts`). This is the contract a vendor
> extract must satisfy — NOT a wishlist. Anything not listed here is not
> required.

## 1. Core row semantics (non-negotiable)

Each row must be a **consensus snapshot as of a historical date** —
the state of the estimate consensus at time `obs`, not today's
back-computed value.

| Requirement | Why |
|---|---|
| One row per (security × fiscal period × metric × observation date) | Canonical model key |
| `obs_date` = the date the consensus state was valid | `observationDate` in PIT contract |
| Publication/availability semantics documented or inferable | `availableAt` — usable at T iff `obs <= T AND avail <= T`. Same-day vs +1 business day must be CONFIRMED per vendor |
| Revision history retained (multiple obs per period) | Features need T vs T−30 vs T−60 reconstruction |
| NOT current-state-only | `ZACKS/EE`-style "latest value" tables are unusable for V5-C |

## 2. Required fields per row

| Field | Required | Maps to | Notes |
|---|---|---|---|
| Security identifier (ticker) | ✅ | `ticker` | Must support rename/delisted resolution |
| Fiscal year | ✅ | `fiscalYear` | |
| Fiscal quarter/period type | ✅ | `fiscalPeriod` (Q1–Q4/FY) | |
| Period end date | ✅ | `periodEndDate` | |
| Observation date | ✅ | `observationDate` | PIT anchor |
| EPS consensus mean | ✅ | `consensusMean` | THE core feature input |
| Analyst count | ✅ | `analystCount` | Needed for zero-coverage detection + `analystCountChange` feature. **Null-mean semantics must be documented** (missing vs zero coverage) |
| Revenue consensus mean | ✅ | `consensusMean` (REVENUE metric) | Feeds `revenueSurprisePct`, `revenueRevisionPct` |
| EPS median / high / low / std dev | ◐ desirable | `consensusMedian/High/Low/StdDev` | `epsDispersionPct` uses std dev; missing → feature goes MISSING, not fatal |
| Actual reported value + report date | ◐ desirable | `actualValue`, `actualReportDate` | If absent, `SecActualsSource` (PitFundamentalFact) covers actuals — already built |
| Analyst-level revisions | ✖ optional | `ConsensusRevisionInsert` | Pipeline supports it; features don't require it |
| Stable security ID / master ticker | ◐ desirable | delisted/rename handling | e.g. Zacks `m_ticker`, IBES ticker history |

## 3. Coverage requirements (frozen audit gates)

| Dimension | Minimum | Frozen source |
|---|---|---|
| Universe coverage | ≥ 60% of 575 frozen securities must have ≥1 fact | `FROZEN_AUDIT_THRESHOLDS.minUniverseCoveragePct` |
| OOS month coverage | ≥ 80% of months in `2023-06-18 → 2025-09-30` with ≥1 observation | `minWindowCoveragePct` |
| Missingness | ≤ 5% null `consensusMean` among ingested rows | `maxMissingMeanPct` |
| Temporal depth | OOS window + ≥90 days lookback (revision/acceleration features need T−60); ideally 2010+ for full train/validation | feature lookbacks |
| Delisted securities | Must include terminated/delisted tickers — 173 of 575 universe; their absence = survivorship bias | frozen universe |

Practical translation: a vendor covering ~4–5k US equities with daily
consensus snapshots over 2022–2025 (minimum) / 2010+ (desired) and
including delisted names satisfies the contract.

## 4. Form and process requirements

- **Bulk extract** (CSV/JSON/S3/Snowflake) or API with full-history pull
  — must reach history, not just trailing N months
- Row-level dedup key derivable (`sourceRecordHash` — we hash content)
- License permits internal quantitative research/backtesting
- **Sample available before purchase** — profiler needs a real extract;
  if a vendor cannot produce ANY sample, that itself is a red flag

## 5. Vendor evaluation questions (ask BEFORE paying)

1. Is each row a point-in-time consensus snapshot with a distinct
   observation/revision date? (Reject "current value + last change date"
   tables.)
2. What is the exact availability semantics of `obs_date` — usable
   same day or next business day? Any publication lag field?
3. Does a null/blank consensus mean "no contributing analysts" or
   "data missing"? (Zero-coverage semantics — opt-in filter depends on it.)
4. Are delisted/terminated securities included? Since when?
5. Is there a stable security ID surviving ticker renames?
6. Revenue estimates: same revision structure as EPS? Coverage depth?
7. Actual reported EPS/revenue: provided? With report timestamps?
8. Can we get a 100–1,000-row sample extract before purchase?

## 6. Candidate matrix — vendor research findings (2026-09-18)

Legend: ✅ confirmed from official docs · ⚠ unconfirmed / needs trial or email · ❌ disqualifier

### Viable candidates

| Vendor | PIT revision history | Revenue | Delisted | Individual access | Verdict |
|---|---|---|---|---|---|
| **Estimize** | ✅ "all data point-in-time", history Jan 2012+, individual estimates + revisions per contributor + consensus time series | ✅ EPS + revenue | ⚠ community-driven coverage — must verify depth on testing file | ✅ **free historical testing files**, then license | **#1 — zero-cost acceptance test** |
| **Zacks direct** | ✅ history files marketed for quant backtesting (Q 1982+, A 1978+) | ✅ sales 2000+ | ✅ 16k+ incl. inactive | ⚠ needs email — one-time extract price unknown | #2 — best schema match, price TBD |
| Nasdaq `ZACKS/EEH` | ✅ obs_date confirmed in vendor correspondence | ✅ `sal_*` | ✅ via `ZACKS/MT` | ❌ **institutional only** (confirmed 2026-09) | gated |
| LSEG I/B/E/S | ✅ PIT-native broker estimates, 1976+ | ✅ | ✅ | ❌ institutional | gated |
| WRDS (IBES/Estimize/Zacks) | ✅ | ✅ | ✅ | ❌ academic affiliation required | gated |

### Disqualified for the V5-C contract

| Vendor | Why disqualified |
|---|---|
| Intrinio Zacks API | `eps_estimates` = current state + `mean_7/30/60/90_days_ago` lookback columns (EET-style), NOT revision-level obs history. `eps_surprises` = ONE pre-earnings snapshot per period + actual — cannot reconstruct consensus at arbitrary T → revision/acceleration features impossible |
| Finnhub | `eps_estimates` current-only; earnings calendar = one obs per period — same disqualifier |
| Alpha Vantage | earnings estimates = current snapshot only — same disqualifier |

Notes:
- Estimize caveat: consensus = Estimize community (buy-side + independents),
  NOT Wall Street sell-side. Valid for the V5-C hypothesis ("does a consensus
  signal add value?") but the result would characterize the Estimize
  consensus specifically — documented, not hidden.
- Estimize adapter scaffold already exists (`estimize-ingest.ts`) — real
  `Estimates.csv` data dictionary still requires explicit field mapping
  after profiler review (no invented mappings).
- Intrinio `eps_surprises` (17k+ companies incl. BTO/AMC report timing)
  remains a valid *actuals* cross-check source, not a consensus source.

## 7. Acceptance test (same for every candidate)

Any candidate extract — regardless of vendor — goes through the
identical path:

```bash
tsx src/lib/quant/p4-engine/consensus/eeh-profiler-cli.ts <extract.csv> \
  --universe data/quant/processed/v5b-universe-manifest.json \
  --out profile.json
```

→ STOP → verify field semantics against §2–3 → explicit adapter mapping
→ canonical ingest → `runPitAudit` (frozen 60/80/5 gate) → OOS.

A vendor PASSES only if the empirical audit passes on real data —
no exceptions, no threshold tuning.
