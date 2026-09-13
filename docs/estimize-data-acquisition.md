# Estimize Data Acquisition Plan + PIT Proof Protocol

**Date**: 2026-09-13
**Status**: Operational plan (frozen BEFORE any vendor data is received)
**Supplements**: `docs/v5c-experiment-protocol.md`, `docs/v5c-gate-provenance.md`

---

## 1. Blocker statement

The project is NOT technically blocked. It is operationally blocked on data
acquisition:

```
EarlyWinner code       ✅ 100%
PIT validation         ✅
V5-C harness           ✅
GO/NO-GO rule          ✅
                    ↓
             ESTIMIZE DATA   ❌ BLOCKER
```

No code changes are permitted. The only work item is data acquisition.

## 2. Acquisition variants (in order)

### Variant A — Estimize account / free trial
Sign up at estimize.com and request/download the historical testing files
(`Consensus.csv`, `Estimates.csv`). Estimize publicly states historical
testing files are available at no cost for trial ("we make our live API and
historical testing files available, at no cost, for trial"). If an account
exists, this is the fastest path.

### Variant B — support/sales request (draft below)
If trial self-service is unavailable, send the request in §4.

### Variant C — vendor fallback audit (ONLY if Estimize blocks the dataset)
Do NOT rework EarlyWinner. Run a short vendor fallback audit with exactly
ONE acceptance question per vendor:

> "Can the vendor deliver historical consensus observations with a
> timestamp of what was KNOWN at time T (per-estimate created_at /
> per-snapshot updated_at), enabling as-of-T reconstruction?"

NOT "does the vendor have historical EPS data". Candidates in order:
Zacks Direct (enterprise, PIT since 1979/1982) → Intrinio (verify PIT
semantics of estimates via trial) → other genuinely PIT vendors.

## 3. ESTIMIZE PIT PROOF — frozen acceptance criteria

Before running the full V5-C, a small proof MUST validate that
`consensusAt(T)` reconstructs exactly what was knowable at T.

**Sample (frozen):** 20–50 historical earnings releases, ≥ 10 distinct
tickers, spread over ≥ 3 different years (incl. pre-2020 to prove depth).

**Per release, verify:**
1. `consensusAt(reportDate − 1d)` equals the consensus value that the
   dataset itself shows as of that date (no post-report revisions leak in).
2. Zero individual estimates with `created_at > reportDate` are counted in
   the pre-earnings consensus.
3. Zero consensus snapshots with `updated_at > T` enter the reconstruction
   at T.
4. Validator rejection stats (duplicates, temporal, future) are reported
   alongside.

**PASS** → ingest the full dataset and proceed to V5-C OOS.
**FAIL** → 🟡 DATA NO-GO: model not evaluated; data/vendor issue first;
thresholds unchanged.

This proof is a DATA gate, not a model gate — it does not touch the frozen
V5 framework.

## 4. Public-page evidence — what it is and is not

Public Estimize release pages showing per-estimate "Last Revised" timestamps
are useful ONLY as feasibility evidence that historical revision data exists.
They are NOT a substitute for the licensed CSV and MUST NOT be scraped as an
ingest source (ToS + selection bias + no completeness guarantee). The ingest
runs exclusively on licensed files.

## 5. Draft support/sales email (Variant B)

> Subject: Historical point-in-time estimates dataset for quant research — trial access
>
> Hi Estimize team,
>
> I'm an independent quantitative researcher working on an earnings-based
> equity ranking model. I'd like to evaluate whether Estimize consensus data
> adds predictive value beyond SEC fundamentals, using a strictly
> point-in-time backtest.
>
> Could you help me with access to your historical testing files
> (US Equity EPS/Revenue — Estimates.csv and Consensus.csv)?
>
> Specifically:
> 1. History back to 2012 (or as far as available) for US listed equities
> 2. Per-estimate `created_at` timestamps and consensus `updated_at`
>    revision history — I need to reconstruct "what was known at time T"
>    without look-ahead
> 3. Point-in-time ticker/CUSIP mapping
>
> Use case: single-user academic-style research, no redistribution of raw
> data; results may be published as aggregate findings.
>
> Could you confirm trial access to the historical files and the appropriate
> license tier (Premium Plus API vs institutional CSV) for this use case?
>
> Thanks,
> <name>
