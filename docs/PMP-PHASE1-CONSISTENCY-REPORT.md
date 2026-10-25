# Phase 1 — Analysis Consistency Refactor: Implementation + Dry-Run Report

Status: **implemented, tested, revalidated, final audit complete — awaiting review before any backfill/deploy.**
No production DB writes, no backfill, no deployment, no schema changes were performed.
Round 3: additive debt/capex extraction + controlled revalidation on a local copy.
Round 4 (this audit): one additional extraction fix discovered and applied —
**SA ebit-repair no longer overwrites reported XBRL `OperatingIncomeLoss`**
(§10). Final comparison runs against `/tmp/pmp-snapshot-v3.db` (a *fresh*
copy of the production snapshot resynced with the complete code). Production
was never touched.

## 1. What changed (diff summary)

| File | Change |
|---|---|
| `src/services/analysis/pillarInputs.ts` (new) | `derivePillarInputs()` — single derivation for all pillar inputs. Exports `selectInterestCoverage()`. |
| `src/services/analysis/scoreCalculator.ts` | −589/+~120 lines: derivation replaced by `derivePillarInputs()`; upsert/notification unchanged. |
| `src/services/analysisCompute.ts` | −328/+~80 lines: read path uses `derivePillarInputs()`; **no cached pillar inputs** — mixed live-vs-cached snapshot eliminated. |
| `src/services/analysis/financialsSync.ts` | **Additive** extraction widening into existing columns — no schema change. Tag lists in §4a. |
| `src/__tests__/pillarInputs.test.ts` (new) | 17 tests, all passing. |
| `scripts/compare-pillar-derivation.ts` (new) | Three-state dry-run comparator (stored / legacy-read / new) → CSV + leg-level attribution. |

`pillars.ts`, `verdict.ts`, `valuationHistory.ts`, `ttm.ts`, schema files: **zero diff.**

## 2. Exact test results

```
Test Suites: 38 passed, 38 total
Tests:       446 passed, 446 total
Snapshots:   0 total
Exit code:   0   (npx jest, run to completion)
```

- Failed: 0. Skipped/todo: 0. `pillarInputs.test.ts`: 17/17.
- Typecheck `npx tsc --noEmit -p tsconfig.json`: only stale `.next/types/app/api/test/route.js` noise (generated types for a deleted route, pre-existing). No error in `src/`.

## 3. Semantic changes (all reviewed, none hidden)

1. **Annual-first interest selection + 3y recency guard** → quarterly → Finnhub → null. `intExp=0` skipped (not a denominator); `null` skipped (missing ≠ zero). 3y bound keeps a recent-but-not-latest FY (KKR FY2023 ≈27mo) over a 3-month cumulative quarter while rejecting decade-stale rows (HST FY2020). Guard acts on row *selection* — the chosen row's own period is always reported; stale data is never relabeled current. 8-test matrix passing (fresh-annual / stale-annual→quarterly / Finnhub-fallback / null→insufficient / zero-skipped / no-cross-period-mixing).
2. **10y statement window** unified (14 tickers affected: V, FANG, JCI, LYV, DTE, PPL, RF, ROL, KIM, HST, FRT, SLG, SWBI, TLN).
3. **`bsStmt` fallback `?? latestStmt`** unified (output-equivalent on income-only rows).
4. **Additive XBRL tag widening** (interest/debt/capex — §4).
5. **Formula preserved**: `storedEBIT / |interestExpense|` provisional basis; accrual vs cash interest distinct (`InterestPaidNet` last-tier fallback, per-row logged at sync).

## 4. Additive extraction widening — final tag list

### interestExpense (ic; `InterestPaidNet` cf = last-tier, cash-basis, logged per row)

Added: `us-gaap_InterestExpenseNonoperating`, `us-gaap_InterestExpenseOperating`, `us-gaap_InterestPaidNet` (fallback only).

### totalDebt

- longTerm: `us-gaap_LongTermNotesPayable`, `us-gaap_ConvertibleDebtNoncurrent`, `us-gaap_SeniorNotesNetOfDebtIssuanceCosts`, `us-gaap_SecuredDebt`
- shortTerm: `us-gaap_NotesPayableCurrent`
- combined fallback: `us-gaap_DebtAndCapitalLeaseObligations`, `us-gaap_DebtInstrumentCarryingAmount`, `us-gaap_NotesPayable` — all placed **before** the legacy `us-gaap_LiabilitiesNoncurrent` catch-all (kept last, unchanged behavior for rows that previously resolved through it; see §7 — it is not a debt concept and is a Phase-2 removal candidate).

### capex

`us-gaap_PaymentsToAcquireOtherProductiveAssets`, `us-gaap_PaymentsToAcquireOilAndGasPropertyAndEquipment`, `us-gaap_PaymentsToAcquireOilAndGasProperty`, `us-gaap_PaymentsToAcquireFurnitureAndFixtures`, `us-gaap_PaymentsToDevelopRealEstateAssetsAndPaymentsForCapitalExpenditures`.

## 5. Controlled revalidation (local snapshot, 48 tickers resynced)

Scope = required 12 ∪ 22 flips ∪ null-out set. `syncFinancials` run against
`/tmp/pmp-snapshot-v2.db`; 48/48 OK, 0 failures.

### Field-level diff v1→v2 (10 core fields, all rows of the 48 tickers)

| Outcome | Count |
|---|---|
| `null` → filled | **1,127** |
| filled → `null` (**regressions**) | **0** |
| value changed >2% (upstream ebit revisions etc.) | 52 |

### Verified recoveries (latest FY row, post-sync DB)

| Ticker | Field | null → value | Source tag |
|---|---|---|---|
| KKR FY2025 | interestExpense | **$2.777B** | `InterestExpenseNonoperating` (accrual; cash `InterestPaidNet` $2.661B stays distinct) |
| KKR FY2024 | interestExpense | $3.034B | `InterestExpenseNonoperating` |
| PCAR FY2025 | totalDebt | **$10.65B** | `NotesPayable` |
| CNH FY2025 | totalDebt | **$27.09B** | `DebtAndCapitalLeaseObligations` |
| CMG FY2025 | totalDebt | **$5.08B** | (CMG is NOT debt-free — converts/facility) |
| SNOW FY2026 | totalDebt | $2.74B | `ConvertibleDebtNoncurrent` |
| AXON FY2025 | totalDebt | $1.92B | `LongTermNotesPayable`+`NotesPayableCurrent` |
| FANG FY2025 | capex | $9.15B | oil-property capex tags |
| VEEV FY2026 | totalDebt $0.10B, capex $0.03B | small real values | widened tags |
| GRMN FY2025 | totalDebt $0.20B | finance-lease-scale real value | widened tags |
| ZION | cashAndEquivalents | $1.6–2.1B/yr | cash extraction on bank rows |

The 52 >2% "value revisions" from round-3 turned out NOT to be legitimate
upstream corrections — they were the SA ebit-repair bug diagnosed and fixed in
this audit round (§10). The superseded claim is kept for history; §10–§13 hold
the corrected numbers.

## 6. Post-sync three-state comparison (999 tickers)

`/tmp/pmp-phase1-compare-v2.csv` — columns: stored/legacy/new pillars, overall,
verdict, causes, leg_diffs, input_diffs, diffs.

| Measure | Pre-sync run | **Post-sync run** |
|---|---|---|
| Rows with any diff | 557 | 550 |
| **Verdict flips** | 22 | **5** |
| `live-vs-cached-mix` | 547 | 537 |
| `interest-selection` | 400 | 404 |
| `window-bound` | 14 | 13 |

### 6a. The 5 remaining verdict flips — reconciled

| Sym | S→N | S / L / N overall | Driver legs | Classification |
|---|---|---|---|---|
| PCAR | strong_exp→mixed_exp | 66.2 / 66.2 / 65.2 | quality.piotroski 15→10 | cached piotroski=5 → live 4 (debt now real $10.65B → cash-flow score drops one notch) — refactor-exposed |
| COF | mixed_fair→weak_fair | 48.2 / 48.2 / 46.6 | quality.beneish 20→12 | live beneish −2.17 vs cached −2.22 crosses band; coverage 0.43→0.14 input-level — refactor-exposed |
| JNJ | mixed_exp→strong_exp | 55.2 / 59.6 / 64.6 | health.altmanZ 0→25 | **the consistency bug itself**: cached altmanZ=null→live 5.46; coverage now 33.55 post-ebit-revision — intended fix |
| AHR | mixed_fair→weak_fair | 50.8 / 50.8 / 46.2 | health.interestCoverage 18→3 + altmanZ 18→3 | coverage 7.70→0.57 on FY2025 (REIT, heavy leverage vs thin ebit — real annual economics) + live altmanZ 0.21 — intended selection + real data |
| AMG | strong_fair→mixed_fair | 68.6 / 67.6 / 66.2 | health.altmanZ 25→18 | live altmanZ vs cached (AMG is a financial — industrial-model caveat documented) — refactor-exposed |

**Zero unexplained flips.** The earlier 22→5 collapse: 17 prior flips were driven
by coverage values from stale quarterly rows that no longer win selection once
fresh data exists — resyncing (the actual production fix path) absorbed them.

### 6b. Required ticker set — post-sync

| Ticker | Stored → New | Note |
|---|---|---|
| KKR | H26→33 | **FY2025 now selected, coverage 2.556** (=7.099/2.777 verified) → 10 pts |
| BX | identical | coverage 14.04→14.11 input-only |
| BAM | identical | coverage 20.1→33.6 input-only (FY2025 intExp recovered) |
| APO | P65→50, V60→55 | stale profit/val cache; coverage 21.7→26.1 input-only |
| ARES | H8→11 | coverage −0.25→+0.28 (FY2025 intExp $0.94B recovered) |
| CG | H11→26 | coverage 1.73→9.36 FY2025 + debt $13.9B recovered |
| TROW | H68→93, V75→90, M75→95 | stale cache; debtRepaymentYears null→0 (debt $0.47B now real) |
| BN | identical | no Finnhub rows — stays as-is |
| AIG | H48→41 | coverage 13.07→9.80 crosses band |
| JPM | identical | coverage 0.71→0.74 input-only |
| DELL | identical | coverage 7.34→6.02 input-only |
| MSFT | **byte-identical** | industrial path untouched ✓ |

## 7. Missing-debt policy — proposal only (Phase 2, not implemented)

Post-widening, **135 tickers still have `totalDebt=null` with `cash` present on
the latest FY**. Two sub-populations verified from the same rows:

- **TL >> cash → debt "unknown"** (~90 tickers): EQIX TL$26B/cash$3.2B, DLR, MS
  TL$1.3T, GS, TRV, AFL, PGR, TSLA TL$54.9B, NOW, ADSK, ILMN, REITs (O, VTR, ARE,
  WELL, REG, SLG, KRC…), homebuilders (DHI, PHM, TOL, KBH). Liabilities this size
  plausibly contain real debt → correctly *insufficient*, never "debt-free".
- **TL ≤ cash → candidate "confirmed near-zero"** (~45 tickers): PLTR
  TL$1.4B/cash$7.2B, ANET, MNST, MPWR, RDDT TL$0.31B, KVYO, FIG, RMBS, RVMD,
  EXEL, TOST, TW, FNV, INCY, UTHR, PATH, SMMT, TWST, VICR, BMNR, ALAB… A
  liability stack smaller than cash cannot hide material debt.

**Proposed implementation (needs approval, contains a scoring change):**
```
debtState = totalDebt != null            → 'reported'   (use value, incl. true 0)
          : totalLiabilities!=null && totalLiabilities <= cash → 'confirmed-zero'
          : otherwise                    → 'unknown'
'confirmed-zero' → netDebt = −cash → netCash leg eligible (as today for debt=0)
'unknown'        → legs null → 0 pts (existing missing-data policy, unchanged)
```
Alternative: persist a `debtProvenance` column at sync time (additive nullable
column — explicit schema approval required). Heuristic requires no schema and is
verifiable row-by-row; provenance column is cleaner long-term.

Affected score impact if the heuristic were adopted: ~45 tickers gain the
net-cash leg (+≤25 health pts) — **not implemented**; per approval this stays
isolated from Phase 1.

`us-gaap_LiabilitiesNoncurrent` remains last in the totalDebt fallback (existing
semantics preserved) but is **not a debt concept** — Phase-2 removal candidate;
deferred tickers relying on it keep current (inflated) values until then.

## 8. Scope reconfirmation

| Check | Result |
|---|---|
| FCF-yield fallback | unchanged — `currentFcfYield ?? latestValuation.fcfYield`; Finnhub P/FCF stays display-only |
| Pillar thresholds / legs / verdict rules / sector methodology | zero diff |
| Accrual vs cash interest | distinct — `InterestPaidNet` separately-tracked, per-row logged |
| null vs genuine zero | preserved — no tag added fabricates a value; `intExp=0` never used as denominator |
| Liabilities-as-debt | no new reinterpretation (legacy fallback kept last, flagged) |
| Schema | zero changes |
| Production writes / backfill / deploy | **none — revalidation ran on a local snapshot copy** |
| AM scoring model / moat methodology / contract-revenue columns | untouched, out of scope |

## 9. Final classification — intentional changes vs residuals

**Intentional (reviewed):**
1. Annual-first interest selection + 3y recency guard.
2. Additive extraction widening (interest/debt/capex) — 1,127 verified fills, 0 null-overwrites.
3. 10y statement window (14 tickers).
4. Read-path consistency (537 tickers' inputs previously mixed cache+live).

**Residual unexplained differences: none.** Every delta carries leg-level cause
in the CSV. 5 verdict flips, all reconciled (§6a).

**Gate remains**: no backfill, no deploy. Remaining decisions for you:
(a) approve Phase-1 release incl. extraction widening + re-running affected
    tickers on production;
(b) the missing-debt proposal above (Phase 2 — heuristic vs provenance column);
(c) `LiabilitiesNoncurrent` removal timing;
(d) FCF-yield Finnhub fallback decision (still deferred).

Artifacts: `/tmp/pmp-phase1-compare-v2.csv`, `/tmp/pmp-phase1-v2.txt`,
resync field-diff verified v1→v2 (§5).

---

# ROUND 4 — FINAL AUDIT (release gate)

## 10. Root-cause fix: SA ebit-repair was overwriting reported GAAP EBIT

### 10a. T FY2022 −$4.587B → +$28.349B — full provenance

| | Stored (v1) | Round-3 resync (v2, buggy) | Corrected (v3) |
|---|---|---|---|
| ebit | **−$4.587B** | **+$28.349B** | **−$4.587B** (restored) |
| source tag | `us-gaap_OperatingIncomeLoss` (Finnhub XBRL, GAAP reported) | StockAnalysis `opinc` field (**adjusted** operating income) | `us-gaap_OperatingIncomeLoss` |
| period | FY2022, endDate 2022-12-31 | same row | same row |
| unit | USD billions (XBRL `usd`) | USD billions | USD billions |

Raw FY2022 XBRL evidence (Finnhub `financials-reported`, ic section):
`us-gaap_OperatingIncomeLoss = −4.587B`, `us-gaap_CostsAndExpenses = 125.328B`,
`t_GoodwillImpairmentLoss…Disposition = 27.498B`, `us-gaap_InterestExpense = 6.108B`,
`us-gaap_NetIncomeLoss = −8.524B`.

**Mapping logic / bug**: `mergeSAPage()` ebit repair replaced any stored ebit
that diverged from SA `opinc` by >50%, **without distinguishing a fabricated
stored value from a REPORTED XBRL `OperatingIncomeLoss`**. SA `opinc` is an
adjusted basis that excluded T's $27.5B goodwill impairment (−4.587 + 27.498
≈ +28.9 ≈ SA's 28.349). So the repair "corrected" a valid GAAP reported value
to a different accounting concept — adjusted vs GAAP mismatch, not an error
correction.

### 10b. Fix applied — option B approved and implemented

~~Round-4 interim fix (`reportedEbitKeys` same-run guard) was superseded~~ —
per approval, **the >50% SA ebit-repair branch is deleted entirely**
(`mergeSAPage`, gapfill path). `ebit` on an existing row is now written
exactly one way: `saEbit` fills `ebit == null` only. The `reportedEbitKeys`
plumbing was removed with it — dead code once no repair exists to guard.
Finnhub-side `writeEbit` semantics unchanged (reported writes; fabricated
never replaces an existing value).

### 10c. All 52 >2% ebit revisions — reclassified

| Run | >2% ebit revisions | Notes |
|---|---|---|
| Resync run 1 (buggy repair) | **52** | every one diagnosed `REPORTED-overwritten-by-SA` — stored matched Finnhub `OperatingIncomeLoss`, replaced by SA adjusted `opinc` |
| Resync run 2 (fix, first pass) | 26 | residual: Finnhub payload for those tickers omitted the previously-reported period/tag **that run** → no protection key → repair still fired (transient response variance, see §14a) |
| Resync run 3 (fix, complete payloads) | **0** | every reported ebit preserved: T FY2022 −4.587, GEV FY2024 0.471, THC FY2024 5.956, CELH FY2025 0.141, AXON FY2025 −0.062 |

Final v1→v3 field diff over all rows of the 48 tickers: **1,278 `null`→filled,
0 filled→`null`, 0 filled→changed >2%**. No mixed periods/units: all fills land
on the same `fiscalYear+fiscalPeriod` row; XBRL values are USD-denominated
filer data (SA page values same currency for these US filers); accrual vs cash
interest remain separate fields/tiers.

**Finding**: run-2's residual 26 prove the protection is *payload-completeness
dependent* — Finnhub occasionally returns a partial `data.data` set within a
run (no error raised). If a previously-reported period is absent that run, the
stored reported value is indistinguishable from a fabricated one and repair
can still clobber it. Durable fix needs persisted provenance
(nullable `ebitReported`/`ebitSource` column — **schema change, proposal only**)
or restricting the repair to `curEbit == null`. Unresolved, flagged §14.

### 10d. Case analysis — protection under incomplete payloads (review gate)

| # | Case | Behavior today | Safe? |
|---|---|---|---|
| 1 | Finnhub reports `OperatingIncomeLoss` this run | `ebitIsReported` → `writeEbit` stores it; key added → SA repair skips | ✅ |
| 2a | Later sync: item present, OIL tag **absent** this run | `ebitIsReported=false` → `writeEbit=false` → upsert does **not** touch `ebit`; SA ebit write is null-fill-only → stored survives on BOTH paths | ✅ (post-B) |
| 2b | Later sync: whole item absent | no Finnhub write; SA ebit write is null-fill-only → survives | ✅ (post-B) |
| 3 | Transient/incomplete payload + SA `opinc` present | = case 2 — was empirically proven pre-B (26 rows, resync-run-2); post-B structurally impossible — no code path writes ebit on an existing row | ✅ (post-B) |
| 4 | Finnhub reports a NEW value for an existing period | `writeEbit=true` → restated value stored | ✅ |
| 5 | Stored ebit genuinely fabricated/missing | no repair — fabricated value persists (documented residual, §14a/§17); `null` still fills from SA | ✅ as designed |

**Post-B answer: a transient missing row CANNOT cause a stored ebit to be
overwritten** — the only remaining ebit write on an existing row is
`ebit == null → fill`. Verified by regression tests
(`saEbitProtection.test.ts`, 8 tests incl. the T FY2022 fixture: stored
−4.587B + SA opinc +28.349B → patch carries no `ebit` key).

### 10e. Durable provenance — options compared (proposal, nothing implemented)

| Option | Mechanism | Schema? | Kills clobber class? | Cost / trade-off |
|---|---|---|---|---|
| **A. `ebitSource` column** | nullable text on `FinancialStatement`: `'finnhub-reported'`/`'finnhub-fabricated'`/`'sa'`/`null(legacy)`; repair skips `finnhub-reported`; unknown provenance → conservative skip | **yes** (additive nullable; StockCV/GL don't read it — contract-safe) | ✅ durable across runs | needs prod `ALTER TABLE` + approval; legacy rows start `null` → treated conservatively (repair off) until re-provenanced |
| **B. Repair = null-fill only** | delete the `>50%` divergence branch in gapfill; SA still fills `curEbit == null` and creates new rows | no | ✅ nothing can be clobbered | loses the repair's original job — legacy *fabricated* ebits (old GP−SGA rows never touched by an OIL tag) stay fabricated until option A lands; they're estimates either way, so the regression is bounded |
| **C. Payload-completeness gate** | run repair only when Finnhub `data.data` for the page looks complete (item count sanity / non-empty) | no | ⚠ partial — item-level and tag-level omissions still slip; fragile heuristic on an unreliable API | adds a second failure mode without fixing the root one |
| **D. Verify-on-demand refetch** | re-fetch XBRL for a candidate period before repairing | no | ⚠ same transient exposure on the refetch | doubles API calls for marginal gain |

**Decision**: **B implemented** (repair deleted — approved scope). **A remains
the durable end-state when schema is next touched** — not implemented: for
*durable* provenance a column is genuinely necessary, because
`FinancialStatement` carries no provenance field, so after the process exits
there is no way to distinguish "reported −4.587B" from "fabricated −4.587B".
No heuristic on value/shape can replace that bit.

GAAP reported ebit and SA adjusted `opinc` remain distinct concepts end-to-end:
the repair was the only place they were conflated, and option B removes even
that.

## 11. Final three-state comparison (v3 DB — complete payloads)

`/tmp/pmp-phase1-compare-final.csv`:

| Measure | Pre-sync | Round-3 post-sync | **Final (v3)** |
|---|---|---|---|
| Rows with any diff | 557 | 550 | 559 |
| **Verdict flips** | 22 | 5 | **12** |
| live-vs-cached-mix | 547 | 537 | 547 |
| interest-selection | 400 | 404 | 404 |
| window-bound | 14 | 13 | 14 |

Flips rose 5→12 versus round-3 because restoring **reported GAAP ebits** (the
correct data) shifts coverage/altman/piotroski legs vs both the stale cache and
the round-3 SA-adjusted values. The originally-asked 5 are all still present;
7 more (T, THC, MKL, PINS, PTGX, RRC, CELH) reconcile cleanly below.

### 11a. All 12 verdict flips — reconciled

| Sym | Verdict S→L→N | Overall S/L/N | Responsible legs (exact) | Inputs, period, source | Cause class | Expected/correct? |
|---|---|---|---|---|---|---|
| **T** | mixed_cheap→weak_cheap→**weak_cheap** | 55.4/52.8/52.8 | quality composite (marginStability 0.033→0.086 etc.) | FY2025 selection (intCov 3.39→3.55); FY2022 ebit stays GAAP −4.587B | **stale cache** — live page already showed weak_cheap | ✅ expected (cache-only flip) |
| **THC** | strong_fair→mixed_fair→**mixed_fair** | 73.8/71.2/71.0 | health.interestCoverage 18→10, quality.piotroski 15→22 | FY2025 intCov 4.27 (was stale 15.07); FY2024 ebit protected reported 5.956B | stale cache (live already mixed) + annual-first | ✅ expected |
| **MKL** | weak_fair→mixed_fair→**mixed_fair** | 53.2/54.2/54.2 | health composite | intCov 12.46→15.52 FY2025 (Markel debt filled) | stale cache | ✅ expected |
| **PINS** | strong_fair→mixed_fair→**mixed_fair** | 70.6/64.8/64.8 | health 100→75 (net-cash leg → null, honest insufficient) | debt tag genuinely absent in XBRL | stale cache + missing-data | ✅ expected |
| **PCAR** | strong_exp→strong_exp→**mixed_exp** | 66.2/66.2/65.2 | quality.piotroski 15→10 (F=5→4) | FY2025 vs FY2024: leverage now a REAL test — debt 10.65/avgTA 0.243 > 9.89/43.42 0.228 → fails; shares 526.8M > 526.6M → fails; ROA 5.4% < 9.6% → fails; gm, asset-turnover fail. Recomputed F=4 verified component-by-component | **corrected data** (debt tags) + stale cache (cached 5 predates FY2025 pair) | ✅ correct — verified arithmetic |
| **COF** | mixed_fair→mixed_fair→**weak_fair** | 48.2/48.2/46.6 | quality.beneish 20→12; coverage input 0.43→0.14 | FY2025 (Discover merger): rev 69.25B vs 53.94B, NI 2.45B vs 4.75B → beneish −2.172 vs cached −2.222 crosses band. FY2025 intCov = 2.281/15.818 = 0.144× | **corrected data** (new FY2025 fundamentals) + **model limitation**: bank "ebit" is post-interest pretax income → coverage ≈0.14 is semantically meaningless for banks (interest already deducted) — pre-existing metric limitation, unchanged semantics | ✅ data correct; ⚠ bank coverage metric caveat |
| **JNJ** | mixed_exp→mixed_exp→**strong_exp** | 55.2/59.6/64.6 | health.altmanZ 0→25 (+coverage 23.96→33.55 FY2025) | FY2025 all inputs present: TA 199.2, CA 55.6, CL 54.1, RE 169.0, TL 117.7, ebit 32.6, rev 94.2 → Z = 5.46 | **consistency bug fixed**: cached altmanZ was `null` — written before FY2025 BS fields arrived; live data always supported it | ✅ intended fix; formula fit below |
| **AHR** | mixed_fair→mixed_fair→**weak_fair** | 50.8/50.8/46.2 | health.altmanZ 18→3, health.interestCoverage 18→3, quality.piotroski 15→22 | FY2025 row (endDate 2025-12-30): ebit $0.049B / intExp $0.086B = **0.567×** — same row, same period, same SA basis (Finnhub returns **0 annual items** for AHR → SA-sourced). altmanZ 2.80→0.21 | **corrected data + annual-first selection**; quarterly row (Q2'26 cumulative 0.288/0.037=7.8×) no longer wins | ✅ computation correct; ⚠ REIT caveat below |
| **AMG** | strong_fair→strong_fair→**mixed_fair** | 68.6/67.6/66.2 | health.altmanZ 25→18; coverage input 4.97→2.97 | FY2025: ebit 0.406 / intExp 0.137 (recovered tag) = 2.97×; altmanZ 3.26→2.95 | **corrected data** (interest tag recovered) + **model limitation** (Altman on an asset manager) | ⚠ data correct, model caveat below |
| **PTGX** | mixed_fair→mixed_fair→**weak_fair** | 44.4/41.4/37.4 | growth.revenueCagr 20→0 (CAGR 13.88→`null`) | FY revenue is `null` on ALL rows in **v1 AND v3** — Finnhub reports no `Revenues` concept for PTGX (NI/ebit present, revenue absent); stored 13.88 was computed from older rows since null-overwritten | **pre-existing extraction gap**, unrelated to refactor — honest insufficient → 0 pts | ✅ honest null; ⚠ unresolved extraction gap §14c |
| **RRC** | strong_fair→strong_fair→**mixed_fair** | 69.6/69.6/68.2 | health.interestCoverage 25→18 | FY2025: ebit 0.963 / intExp 0.105 = 9.17× (was stale-quarterly >bucket) | annual-first intended selection | ✅ intended |
| **CELH** | strong_fair→mixed_fair→**mixed_fair** | 75.6/66.0/64.6 | health.altmanZ 25→18 | FY2025 reported ebit 0.141 (protected) vs FY2024 0.156 on TA 5.12 → lower C term | stale cache (live already mixed) + corrected data | ✅ expected |

**Zero unexplained flips.** Every flip is (a) stale-cache display lag already
visible on the live page, (b) intended annual-first selection, or (c) corrected
extraction data — with two documented model caveats (COF/AHR/AMG) and one
pre-existing extraction gap (PTGX).

### 11b. JNJ — why altmanZ was `null`, and formula fit

- **Why null**: `altmanZ` is null only when no statement row carries balance
  fields (or `totalAssets` ≤0). The cache row was written 2026-10-25, the same
  day FY2025's BS fields landed — the write ran against a state where the
  available rows lacked a usable BS row, and the value was never recomputed.
  Read-time then consumed cached `null` → 0 pts on a 25-pt leg → health 37.
- **Why 5.46 now**: FY2025 supplies every input (WC 1.5B, RE 169B, ebit 32.6B,
  mkt-cap-vs-TL ≈ 3.7×, rev/TA 0.47). All single-period FY2025 — no mixing.
- **Formula fit**: Altman's Z was calibrated on manufacturers. JNJ is a large,
  profitable healthcare conglomerate — structurally similar (tangible-asset
  base, real working capital), though intangibles-heavy pharma suppresses the
  A (WC/TA) term; B (retained earnings) and D (equity/liabilities) dominate the
  score. Z=5.46 → "safe zone" (>2.99) is a *plausible, not misleading* reading
  for JNJ. Conclusion: appropriate enough to keep; no adjustment needed.

### 11c. AHR — exact coverage inputs

- Period: **FY2025** (fiscalPeriod 'FY', endDate 2025-12-30 — single row, no
  cross-period mixing; annual-first guard accepted it: ~10 months old).
- ebit **$0.049B**, interestExpense **$0.086B** → 0.049/0.086 = **0.567×** → 3 pts.
- Source: Finnhub `financials-reported` returns **zero annual items** for AHR
  (recent IPO) → row populated via StockAnalysis (`opinc` + interest line) —
  internally consistent basis within the row.
- Economics: AHR is a healthcare REIT — GAAP/SA operating income is crushed by
  real-estate depreciation while interest is a real cash outflow → GAAP-basis
  coverage <1× reflects capital structure more than distress (FFO coverage is
  materially higher). Altman 0.21 same caveat — real-estate asset base breaks
  the Z terms. **Computation is correct on the declared metric; the metric
  itself understates REIT solvency** — model limitation, out of scope to fix.

### 11d. AMG — why Altman Z misleads for a financial company

AMG (Affiliated Managers Group) is an asset manager: TA $9.2B is dominated by
goodwill/intangibles and partnership financial assets, not industrial working
capital. Altman's terms break: WC/TA is near-meaningless (no inventory/
receivables cycle), retained earnings are suppressed by acquisition accounting,
and revenue/TA measures fee income over a largely intangible base → Z
systematically biased. Z 2.95 (down from cached 3.26) shouldn't be read as
deteriorating distress risk — the leg move 25→18 is a model-fit artifact on
corrected inputs. **Model unchanged** per scope; flagged for the future
business-model-aware scoring track.

## 12. Changed files — final list

| File | Change |
|---|---|
| `src/services/analysis/pillarInputs.ts` (new) | `derivePillarInputs()` + `selectInterestCoverage()` (annual-first, 3y guard). |
| `src/services/analysis/scoreCalculator.ts` | −589 lines duplicated derivation → shared call. |
| `src/services/analysisCompute.ts` | −328 lines; read path fully on shared derivation, no cached pillar inputs. |
| `src/services/analysis/financialsSync.ts` | Additive XBRL widening (interest/debt/capex) + **SA ebit-repair branch deleted — null-fill only (option B)** + **full-mode ebit guard (final gate fix)**; `mergeSAPage`/`SAData` exported for tests. |
| `src/__tests__/pillarInputs.test.ts` (new) | 17 tests. |
| `src/__tests__/saEbitProtection.test.ts` (new) | 8 tests — T FY2022 fixture, structural no-overwrite guarantee, null-fill, period conventions. |
| `scripts/compare-pillar-derivation.ts` (new) | 3-state dry-run comparator. |
| `docs/PMP-PHASE1-CONSISTENCY-REPORT.md` | this report. |

`pillars.ts`, `verdict.ts`, `valuationHistory.ts`, `ttm.ts`, schema: zero diff.

## 13. Test & typecheck status (final)

```
Test Suites: 39 passed, 39 total
Tests:       454 passed, 454 total  (0 failed / 0 skipped / 0 todo)
Exit code:   0  — npx jest, run to completion
```

(+1 suite / +8 tests: `saEbitProtection.test.ts` — T FY2022 regression fixture
verified: stored reported −4.587B is never patched; null-fill still works;
period conventions unchanged.)

Typecheck `npx tsc --noEmit -p tsconfig.json`: no `src/` errors; only stale
`.next/types` references to the deleted `api/test/route` (generated artifacts,
pre-existing — not source errors). Standalone-alias `tsc` noise was an
invocation artifact, not a code failure.

## 14. Unresolved issues (all flagged, none blocking silently)

| # | Issue | Status |
|---|---|---|
| a | ~~SA ebit-repair can clobber a previously-reported ebit on an incomplete payload~~ — **RESOLVED by option B**: repair branch deleted, ebit write on existing rows is null-fill-only (§10d). Residual: fabricated legacy ebits now persist until a reported tag or a null-fill reaches them — §17 assessment. | resolved (B) |
| b | `LiabilitiesNoncurrent` last-tier debt fallback is not a debt concept; removal prepared but deferred per approval. | approved-in-principle, separate change |
| c | PTGX: Finnhub reports no `Revenues` for any period → revenueCagr null → growth leg 0 (honest insufficient; SA page could gap-fill revenue in a future extraction pass). | unresolved extraction gap |
| d | Coverage metric on banks (COF 0.14×): bank "ebit" is post-interest pretax income → ratio semantically meaningless. Pre-existing limitation, semantics preserved. | model limitation, documented |
| e | Altman Z on financial/REIT balance sheets (AMG, AHR; also MKL inputs): terms structurally misfit — flagged for business-model-aware scoring track. | model limitation, documented |
| f | Missing-debt policy (three-state) — **revised below** per rejection of `TL≤cash` heuristic. | proposal only |

## 15. Missing-debt policy — revised proposal (rejected heuristic removed)

`total liabilities <= cash` is **rejected** as zero-debt evidence — sub-cash
liabilities do not prove absence of interest-bearing debt.

Proposed three-state classification (proposal only, **not implemented**):

| State | Criteria |
|---|---|
| `positive-debt` | A reliable interest-bearing-debt concept (XBRL debt tag or SA debt line) reports value > 0. |
| `confirmed-zero` | A reliable interest-bearing-debt concept is **present and reports 0** (explicit zero on a debt concept — e.g., SA "Total Debt 0" or a zero-valued debt tag), **or** the filer's balance sheet is complete (TL present) AND a debt line is explicitly reported as zero/none. Cash alone never suffices; TL alone never suffices. |
| `unknown / insufficient` | No reliable debt concept present, or debt concepts incomplete/ambiguous → legs `null` → 0 pts under the existing missing-data policy. |

Population: 135 tickers (`debt=null`, cash present, latest FY). Under the
revised rule, only those with an explicit zero-valued debt concept qualify as
`confirmed-zero` — expected to be a **small minority**; the rest stay
`unknown` (no net-cash credit, no fabricated zero). `LiabilitiesNoncurrent`
is not usable as a debt proxy in any state.

## 16. Production-safety confirmations

- Revalidation ran **three times** on local working copies — all fresh copies
  of the **same** production snapshot `/tmp/pmp-snapshot.db` (v1 = baseline,
  untouched):
  - `v2` = copy resynced with post-fix code, run hit a **partial** Finnhub
    payload for some tickers → 26 residual ebit overwrites (§10c/§10d).
  - `v3` = fresh copy resynced with the **identical** code; Finnhub returned
    complete payloads → **0** ebit revisions, 1,278 null→filled, 0 regressions.
  - So v2-vs-v3 differ **only in upstream payload completeness**, not code or
    source snapshot — that is the evidence for the transient-payload exposure.
  - The final comparison (`/tmp/pmp-phase1-compare-final.csv`, 12 flips) runs
    against v3.
- **No production DB writes, no backfill, no resync, no deployment.**
- StockCV/GainersLosers data contract unchanged (no schema diff).
- FCF-yield fallback, verdict/pillar thresholds, AM scoring: zero diff.

**Stopped here per instruction — awaiting explicit approval.**

## 17. Legacy derived-EBIT assessment (option-B residual)

Removing the repair means stored *fabricated* ebits are no longer corrected by
SA. What can be established from current data (production snapshot, 34,139
rows; ebit non-null on 32,531, null on 1,608):

| Category | Identification | Scale |
|---|---|---|
| **Reliably missing** | `ebit IS NULL` | 1,608 rows — SA still null-fills these |
| **Flagged this run** | `ebitVerify=true` in sync logs — Finnhub produced a fabricated ebit for ≥1 period (no OIL tag) | 7/48 resynced tickers: BX, BAM, CG, PCAR, JNJ, KMX, AHR — those periods' stored ebit is fabricated-or-SA (per-period ambiguous, per-ticker flag) |
| **Ambiguous** | non-null ebit, no persisted provenance — cannot distinguish reported / fabricated / SA-written without re-derivation | bulk of 32,531 rows; 3,199 rows have `ebit == grossProfit` exactly (suspicious degenerate, not conclusive) |

**Impact on interest coverage / Health**: `coverage = ebit / |intExp|` uses the
stored ebit directly. Fabricated estimates (GP−RnD−SGA, rev−costs) exclude
one-time charges, so they **overstate** coverage exactly where GAAP is weakest
— impairment/restructuring years (T FY2022: stored-derived +28.3B/6.1B ≈ 4.6×
vs real reported −0.75× — a 0↔18-pt health-leg swing). 249 tickers carry ≥1
negative-ebit row with a usable interestExpense — the population where
adjusted-vs-GAAP divergence is largest. For steady-state profitable periods
the fabricated estimate is usually within ~10–20% of reported (same bucket
more often than not).

**Safe remediation path (not implemented)**: when schema is next touched, add
`ebitSource` (option A) and set it on every write; then a targeted re-verify
pass can re-pull XBRL only for `ebitSource ∈ {legacy-null, fabricated}` rows
instead of trusting or rewriting anything blindly. No bulk rewrite meanwhile —
ambiguous values are left as stored rather than substituted across accounting
concepts.

## 18. Final release audit — Option B working tree

### Diff surface
`mergeSAPage` and `SAData` are now `export`ed — **compile-time surface only**:
no route, API, or other production code imports them (only the new test file).
Production callers reach the module exclusively through `syncFinancials`
(unchanged signature/behavior). No other export changes.

### Validation (final working tree)
- `npx jest`: **39 suites / 457 tests / 0 failed / exit 0** (+3 full-mode guard tests).
- `npx tsc --noEmit -p tsconfig.json`: **clean** — only pre-existing stale
  `.next/types` references to a deleted route; zero `src/` errors.
- Option-B resync on a fresh snapshot copy (`/tmp/pmp-snapshot-v4.db`), 48/48:
  **2,013 null→filled, 0 filled→null, 0 ebit overwritten >2%** — including the
  partial-payload runs that corrupted 26 rows before the fix. T FY2022 stays
  **−4.587B**.

### Dry-run comparison on Option-B data (v4, `/tmp/pmp-phase1-compare-final2.csv`)
- 553 changed rows, 540 live-vs-cached, 404 interest-selection, **8 verdict
  flips**: PCAR, COF, T, JNJ, AHR, AMG, THC, CELH — **reproduced identically
  after the full-mode guard** (guard is sync-side; comparison is read-only).
- All **5 originally-asked flips persist identically** (PCAR piotroski, COF
  beneish, JNJ altmanZ 0→5.46, AHR coverage 0.57, AMG altmanZ) — reconciliations
  in §11a unchanged.
- 4 of the round-4 set dropped out — all explainable by **payload-completeness
  variance**, not scoring instability: PINS (SA filled debt/cash → real
  net-cash leg → stays strong_fair), PTGX (SA filled FY revenue: FY2025 $46.0M
  vs FY2024 $434.4M — real ~90% drop after a 2024 one-time licensing year —
  → CAGR computable again), MKL + RRC (SA-filled quarterly inputs shifted a
  leg marginally across a ±1-band boundary). Flip counts across runs reflect
  **which rows SA gets to fill**, not calculation drift.

### Remaining ebit-overwrite paths (complete enumeration)
| Path | Behavior | Exposure |
|---|---|---|
| Finnhub upsert (L~722) | `ebit` written only when `ebitIsReported` or existing null | ✅ safe — reported restates are intended |
| SA gapfill `update` (L~285) | `ebit` only when `existing.ebit == null` | ✅ null-fill only (option B) |
| SA gapfill `create` (L~249) | new row only | ✅ |
| SA `full` mode upsert (L~235) | ~~`update: stmtData` included ebit unconditionally~~ → **guarded**: `findUnique` first, `ebit` deleted from the update payload when `existing.ebit != null`. Create + null-fill preserved. Regression tests: AMIX (existing ebit → untouched), GBTC (ebit null → filled), generic row (preserved) — 11 tests in `saEbitProtection.test.ts` | ✅ **closed** — protection no longer depends on the caller path or the ticker's revenue rows |

### Remaining known risks
- **Unknown-provenance historical ebit** (§17): bulk of 32,531 non-null rows;
  only `ebitSource` (schema) can resolve durably — no bulk rewrite meanwhile.
- **249 tickers with negative-ebit + interest rows**: impairment/loss-year
  coverage legs are where fabricated vs reported diverge most; left as stored.
- **PTGX-style gaps**: Finnhub omits `Revenues` for some issuers — SA gapfill
  covers it when triggered, but coverage depends on per-run payload
  completeness. Same transient-variance class, non-corrupting under B.
- **`ebitNeedsSaVerify` still schedules gapfill** when a fabricated ebit is
  produced — now only fills nulls, cannot overwrite (pre-existing flag).

### Production safety
All validation ran on `/tmp` snapshot copies (`v2`, `v3`, `v4` — each a fresh
copy of the same production snapshot). **No production DB writes, no resync,
no backfill, no schema migration, no deployment.** `ebitSource` not added;
no scoring/threshold/FCF/AM/debt-policy changes.

**Audit complete — stopped for explicit release approval.**

## 19. Controlled production resync — proposed scope & execution plan

### Scope (exact)
**48 tickers** — the validated set (required 12 ∪ flip set ∪ null-out set):
KKR BX BAM APO ARES CG TROW BN AIG JPM DELL MSFT PCAR FCX COF T PG GD HOOD
ABT JNJ LNG ESS DOCU KMX SONO AHR AMG THC MKL PINS PTGX RRC CELH CMG GRMN
VEEV AXON SNOW GEV FANG ROP ROL CNH GMED MANH MEDP ZION. Nothing else.

### Expected field changes (measured on v1→v4, identical baseline)
| Class | Detail |
|---|---|
| `null`→filled | **2,013** total: totalDebt 582, netPPE 223, interestExpense 198, capex 121, currentAssets 113, currentLiabilities 113, retainedEarnings 108, cashAndEquivalents 105, totalAssets 89, totalEquity 89, totalLiabilities 81, grossProfit 80, sharesOutstanding 70, sbc 21, revenue 19, netIncome 1 |
| filled→filled repairs | **2** — FANG Q2'24/Q2'23 `sharesOutstanding` (integer-EPS-derived → precise; the existing suspicious-shares repair, ~0.03–0.3% magnitude) |
| New rows | **3** — ABT/ROP/ZION Q3'2026 (newly reported quarters) |
| **ebit** | **0 changes of ANY magnitude** — no fills, no writes |
| filled→null | **0** |

Per-ticker fill counts (v1→v4): TROW 126, KKR 98, AMG 86, ESS 72, PTGX 69,
THC 65, HOOD 60, GD/RRC 58, DOCU 57, PCAR 55, ARES 52, COF 49, CNH/VEEV/SONO
48, BX 46, KMX 43, ZION 41(+1 row), AHR 40, SNOW 39, FANG/MANH 38, PG/ROP
37(+1), MKL 37, AXON/CMG/PINS/JNJ 36, GRMN 34, CELH/DELL/GEV 32, ROL 31,
GMED 30, ABT 27(+1), CG 27, LNG 26, FCX/APO 21, JPM 9, BAM 7.

### ebit write-path guarantee (explicit)
An existing **non-null ebit cannot be rewritten by any SA path** (gapfill
null-fill only; full-mode guarded; repair deleted). The **only** remaining
write is a freshly-reported XBRL `OperatingIncomeLoss*` for that period —
same GAAP concept, a legitimate restatement, not a concept swap. Measured on
this exact set: **0 occurrences**. Post-resync gate treats ANY ebit diff as
an anomaly requiring review, not auto-approval.

### Execution plan (safety-verified)

**1. Backup — WAL-safe, verified**
DB runs `journal_mode=WAL` (verified on the snapshot). Plain `cp` is **unsafe**
— committed pages can live in `-wal` only. Use the online backup API:
```bash
sqlite3 /var/www/premarketprice/prisma/data/premarket.db \
  ".backup '/root/premarket.pre-phase1-resync.$(date +%Y%m%d-%H%M).db'"
```
`.backup` yields a consistent point-in-time snapshot even with live writers
(WAL stays with the source; result is a fully-checkpointed single file).

**2. Concurrent-writer inventory (verified)**
- `premarketprice` app — writes `FinancialStatement` only via explicit
  `POST /api/analysis/[ticker]` recompute (manual action, not page traffic).
- `cron-refresh-all` — **Sundays 04:00 UTC only**; calls the same
  `syncFinancials`. Run the resync outside that window.
- `pmp-polygon-worker`, `stockcv`, `gainerslosers` — no `FinancialStatement`
  writes (valuation tables / read-only consumers).
- `busy_timeout` + WAL: our resync and a stray concurrent write can't corrupt
  each other — worst case is gate noise, which the gate flags anyway.

**3. Rollback procedure — controlled writer shutdown first**
Never delete `-wal`/`-shm` while any process may hold the DB open. Ordered
service-window sequence:
```bash
# 1. Quiesce writers — verify no sync/cron run is in progress first
pm2 stop premarketprice
# 2. Fold remaining WAL into the main file (DB closed → safe)
sqlite3 prisma/data/premarket.db "PRAGMA wal_checkpoint(TRUNCATE);"
# 3. Restore the consistent backup over the main file
cp /root/premarket.pre-phase1-resync.<ts>.db prisma/data/premarket.db
# 4. ONLY NOW remove stale wal/shm — leftovers from the old main file must
#    not re-apply onto the restored one; nothing holds the DB open here
rm -f prisma/data/premarket.db-wal prisma/data/premarket.db-shm
# 5. Integrity check BEFORE restart
sqlite3 prisma/data/premarket.db "PRAGMA integrity_check;"   # expect 'ok'
sqlite3 prisma/data/premarket.db "SELECT COUNT(*) FROM FinancialStatement;"
# 6. Restart services
pm2 start premarketprice
```
Inherent caveat: writes between backup and restore are discarded → keep the
window short and outside cron-refresh-all (Sun 04:00 UTC).

**4. Pre-state dump + resync + gate (exact commands, on VPS repo)**
```bash
cd /var/www/premarketprice
npx tsx scripts/p1-resync.ts dump /root/fs-pre-phase1.csv      # ALL 34k rows
npx tsx scripts/p1-resync.ts run                               # 48 tickers, serial, logged
npx tsx scripts/p1-resync.ts dump /root/fs-post-phase1.csv
npx tsx scripts/p1-resync.ts gate /root/fs-pre-phase1.csv /root/fs-post-phase1.csv
```

**5. Gate semantics (`scripts/p1-resync.ts` — verified working)**
- Diffs **every** `FinancialStatement` row, not just the 48 — out-of-scope
  row create/update/delete on any other symbol → anomaly.
- In-scope allowed: `null`→filled (any field), new rows, two named repair
  classes (negative-capex fix; suspicious-shares — each instance logged and
  marked VERIFY, not silently passed).
- **Flag-and-stop (exit 1)**: any `filled`→`null`; **any `ebit` diff** (zero
  tolerance — expected count is 0, a legit XBRL restatement must be eyeballed);
  any other non-null→non-null field change; any in-scope row deleted;
  per-ticker fill count outside ±20% of the §19 reference (deviation → manual
  review, not auto-pass — payload variance and real anomalies look alike).
- **Self-test evidence**: gate on the real v1→v4 dumps → `PASS`, 3 new rows,
  2,013 fills, 2 flagged shares repairs, 0 anomalies. Synthetic injected
  out-of-scope change (`ADM|2018|Q3 netIncome`) → caught, exit 1.

**6. Conscious transient state**
`AnalysisCache` stays untouched — post-resync, fresh statement data coexists
with stale stored scores until a separately-approved recompute. Read-path
pages converge on ISR expiry; screener/verdict columns lag. This is a
**deliberately tolerated temporary state** — the score recompute is the next
separate decision.

### Production resync — EXECUTED (2026-10-25, approved scope)

| Step | Result |
|---|---|
| Backup (`.backup`, WAL-consistent) | `/root/premarket.pre-phase1-resync.20261025-1951.db` (457MB) |
| Pre-dump | 34,139 rows |
| `run` (serial, abort-on-fail) | **48/48 OK**, ~1s/ticker, no abort |
| Post-dump | 34,142 rows (+3 in-scope: ABT/ROP/ZION Q3'2026) |
| **Gate** | **PASS — 0 anomalies**: 2,013 null→filled across 45 tickers; 2 flagged shares repairs (FANG Q2'23/Q2'24, `isSuspiciousShareCount` repair class); 0 `ebit` diffs; 0 filled→null; 0 out-of-scope writes |
| Spot checks | T FY2022 ebit **−4.587B** ✓; KKR FY2025 intExp **$2.777B** ✓; PCAR FY2025 debt **$10.65B** ✓ |

Production result is **byte-for-byte identical** to the local v1→v4 validation
(same fills, same new rows, same two repairs — payload was complete this run).
Artifacts on VPS: `/root/fs-pre-phase1.csv`, `/root/fs-post-phase1.csv`,
backup DB. App served from `.next` build throughout — no restart, no deploy,
`AnalysisCache` untouched (conscious transient state per §19.6).

### Side-effect semantics (explicit)
- `AnalysisCache` score/verdict columns: **untouched** by resync — screener/SEO/OG keep stored values until a separately-approved recompute.
- Read-path pages derive live from statements — after next ISR expiry/revalidate, affected ticker pages can show updated pillar inputs **before** any score write. Transient stored-vs-live divergence is expected and is the same class the refactor already documents; a controlled `AnalysisCache` recompute for the 48 is the separate follow-up decision.
- StockCV/GainersLosers: read-only consumers see updated statement fields on their next fetch; no schema change.
