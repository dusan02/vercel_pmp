# V5-C Real-Data Experiment Protocol

**Date**: 2026-09-13
**Status**: FROZEN before the real-data run
**Supplements**: `docs/v5c-gate-provenance.md` (threshold provenance)

---

## 1. Phase closure

The V5-C methodological phase is CLOSED as of this document. The experiment
is fully specified and awaits exactly one external input: the real
historical Estimize dataset.

Separation of concerns (final):

| Layer | Status | Nature |
|---|---|---|
| Model (weights 35/30/25/10, features, scoring) | 🔒 FROZEN | untouched since V5 close |
| Performance criterion (GO/NO-GO vs V5-B) | 🔒 PREREGISTERED | written before V5-C run, relative to frozen V5-B benchmark |
| Data-quality gates (60 % universe / 80 % window / 5 % missingness) | 🔒 ENGINEERING GATES | chosen during harness prep; provenance disclosed |

## 2. No-tuning commitment (PROHIBITED after seeing results)

From this moment until the GO/NO-GO decision is recorded, the following are
PROHIBITED regardless of outcomes:

- changing 35/30/25/10 category weights
- changing V5 features or the feature registry
- changing the V5-B benchmark numbers
- changing the OOS period or universe
- changing the GO/NO-GO rule or its margins
- changing the 60/80/5 data-gate thresholds after seeing results
- adding new consensus features because the first result disappoints

If V5-C loses, it loses. That is the value of the experiment.

## 3. Mandatory audit artifact chain

The real-data run MUST preserve the following chain, in this order:

```
vendor files (original Estimize CSVs, unmodified)
    ↓  SHA-256
input hashes + row counts + schema summary
    ↓
ingest manifest (command, timestamp, inserted/duplicate/quarantine counts)
    ↓
PIT audit report (empirical-pit-audit output, JSON)
    ↓
V5-C OOS metrics (pearson, spread, hit rate, coverage, JSON)
    ↓
GO / NO-GO decision record (rule inputs + outcome + reasons)
```

### Storage rules

- **Raw vendor files are LICENSED data** — they MUST NOT be committed to git
  (redistribution restriction). Keep them in a local vault directory
  (gitignored), recorded by hash.
- **All derived artifacts (hashes, manifests, reports, metrics, decision)
  are small text/JSON and MUST be committed to git** so the chain is
  verifiable from repository history alone.
- Each artifact records the hash of its predecessor, forming a hash chain:
  anyone can later verify that the decision was produced from the audit,
  the audit from the manifest, the manifest from the hashed inputs.

### The half-year-later claim this enables

> "This was the dataset (hash-verified) from which EarlyWinner V5-C was
> built, these were its PIT properties, and this was the result — with no
> subsequent tuning."

## 4. Decision outcomes (frozen)

- 🟢 **GO** — Pearson > +0.0984 AND spread > +14.03 % AND consensus coverage
  ≥ 60 % AND PIT gate clean → V5-C becomes EarlyWinner V1 candidate
- 🔴 **NO-GO** — Pearson or spread does not improve → V5-B SEC-only remains;
  consensus experiment CLOSED (no tuning, no new features)
- 🟡 **DATA NO-GO** — dataset fails PIT/coverage gate → model NOT evaluated;
  data/vendor problem addressed first; thresholds unchanged

## 5. Run checklist (single batch)

```
1. Place vendor CSVs in vault; compute SHA-256 + row counts
2. Run ingest CLI → capture manifest (inserted/duplicates/quarantined)
3. Run empirical PIT audit → gate must PASS (else 🟡 DATA NO-GO, stop)
4. Run V5-C OOS pass (runOosPass) → metrics
5. Run decideGoNoGo → decision + reasons
6. Commit artifacts: hashes, manifest, audit report, metrics, decision
7. Tag the commit (e.g. v5c-decision) — the experiment's permanent record
```
