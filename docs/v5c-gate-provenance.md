# V5-C Gate — Threshold Provenance Disclosure

**Date**: 2026-09-13
**Status**: Pre-data disclosure (recorded BEFORE any real Estimize data was seen)
**Applies to**: `empirical-pit-audit.ts` (FROZEN_AUDIT_THRESHOLDS), `v5c-oos-harness.ts` (FROZEN_GO_NO_GO)

---

## Purpose

This document records, before the real-data run, **who defined the frozen
thresholds, when, and on what basis** — so the final GO/NO-GO report can
state their epistemic status transparently.

## Timeline of freezes

| Artifact | Frozen | By | Basis |
|---|---|---|---|
| V5 framework (weights 35/30/25/10, features, scoring) | earlier (V5 close) | project owner | frozen before all V5-B/C work |
| V5-B OOS benchmark (Pearson +0.0984, spread +14.03 %, 23,941 obs, 589 securities) | earlier (V5-B run) | project owner | completed OOS run on SEC-only data |
| GO/NO-GO decision rule (V5-C must improve BOTH Pearson and spread vs V5-B; consensus coverage ≥ 60 %) | 2026-09-13 | coding agent (Devin) | written before any real consensus data existed |
| Data-gate thresholds (universe ≥ 60 %, window ≥ 80 %, missingness ≤ 5 %) | 2026-09-13 | coding agent (Devin) | engineering judgment during harness prep; no prior consensus-data experiments to derive them from |

## Classification

1. **GO/NO-GO decision rule → pre-registered (relative to a frozen benchmark).**
   The rule compares V5-C against the already-completed, frozen V5-B OOS
   result. It was written before the V5-C run and does not depend on any
   V5-C output. This is a legitimate pre-registration.

2. **Data-gate thresholds (60 % / 80 % / 5 %) → predefined ENGINEERING GATES,
   not statistically independent pre-registration.**
   They were chosen during harness preparation by the coding agent, without
   real Estimize data and without prior consensus experiments to calibrate
   against. They gate DATA QUALITY (coverage, missingness), not model
   performance. This is standard practice, but it must be stated as such.

## Implication for the final report

The GO/NO-GO report produced by the real-data batch MUST include this
classification verbatim in its methodology section:

> "The model-comparison rule (V5-C vs V5-B) was pre-registered before the
> V5-C run, relative to the frozen V5-B OOS benchmark. The data-quality
> gate thresholds (universe ≥ 60 %, window ≥ 80 %, missingness ≤ 5 %) are
> predefined engineering gates chosen during harness preparation, prior to
> any real consensus data; they are not statistically derived criteria."

## No-tuning commitment

If the data gate or V5-C OOS produces an unfavorable result, the thresholds
and the decision rule are NOT revised. Outcomes:

- 🟢 GO → V5-C becomes EarlyWinner V1 candidate
- 🔴 NO-GO → V5-B SEC-only remains; consensus experiment CLOSED (no tuning)
- 🟡 DATA NO-GO → model not evaluated; data/vendor problem addressed first,
  thresholds unchanged

Any change to weights, universe, OOS split, benchmark, thresholds, features,
scoring, or coverage after seeing real data would invalidate the experiment
and is prohibited.
