# V5 PIT Probe Report — NDL/Zacks Free Tier

**Date**: 2026-09-13 (reconstituted)
**Status**: Complete — NDL free tier rejected as PIT source
**Referenced from**: `src/lib/quant/p4-engine/consensus/vendor-adapter.ts:226`

---

## Objective

Determine whether Nasdaq Data Link (NDL) free tier Zacks consensus data
is suitable as a point-in-time (PIT) historical consensus source for V5-C/D.

## Method

Queried NDL Tables API (`ZACKS/EE`, `ZACKS/SEE`, `ZACKS/EREV`) using the
configured API key.

## Findings

### ZACKS/EE (Earnings Estimates)
- Returns **current** consensus estimates for each ticker/period
- Updated daily at 10:30 UTC
- **No historical snapshots** — only the latest consensus value
- `per_end_date` = fiscal period end (NOT a knowledge timestamp)
- No `knownAt` / `observation_date` / `as_of` field

### ZACKS/SEE (Street Earnings Estimates)
- Same structure as ZACKS/EE
- Same limitation: current only, no historical PIT snapshots

### ZACKS/EREV (Earnings Estimate Revisions)
- Returns **recent** estimate revisions from individual brokers
- Has `eps_rev_date` (revision date) — this IS a knowledge timestamp
- BUT: described as "recent" revisions — rolling window, not full historical archive
- Cannot reconstruct full consensus history from recent revisions alone

## Verdict

**NDL free tier is NOT suitable as a PIT consensus source.**

- `ZACKS/EE` and `ZACKS/SEE` return current consensus only — using these as
  historical data would introduce **look-ahead bias** (today's consensus
  back-mapped to historical prices)
- `ZACKS/EREV` has revision timestamps but only a recent window — insufficient
  for full PIT reconstruction
- No bulk historical archive available via NDL free tier

## Alternative paths identified

1. **Zacks Direct** (zacksdata.com) — full PIT history back to 1979/1982,
   enterprise pricing
2. **Estimize** — explicit PIT data with `created_at`/`updated_at` timestamps,
   history back to 2012, free trial for historical CSV files
3. **Intrinio** — Zacks data via API, 20+ years history, but unclear if EPS
   estimates are PIT or current-for-historical-periods

See: `docs/v5-consensus-vendor-gate.md` for full vendor comparison and decision.
