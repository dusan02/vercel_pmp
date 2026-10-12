# gainerslosers.com — MVP spec v2 (post-review)

Incorporates external review feedback. Product: daily gainers/losers
board where every notable move carries an explanation (or an honest
"no catalyst identified"), plus statistical context (z-score, RVOL).
Read-only over the PMP production SQLite DB, same pattern as stockcv.com.

Positioning decision (accepted): **separate domain, controlled
experiment**. PMP = fundamentals/analysis; gainerslosers = "what moved
today, why, and how unusual was it". GL funnel → PMP analysis pages.

## Verified data audit (prod DB, 2026-10-12)

| Asset | Coverage | Notes |
|---|---|---|
| `Ticker.lastChangePct`/`lastPrice`/`lastMarketCap` | 999/999 | live daily board derivable now |
| `Ticker.latestMoversZScore`/`latestMoversRVOL` | 999/999 | significance context per move |
| `Ticker.moversReason`/`moversCategory` | ~45/day | AI reasons, top σ-events only |
| `MoverEvent` | 845 rows, ~35d | σ-events only, reason on 16% |
| `DailyRef` (prevClose, regularClose) | 31.4k rows, ~988/day, ~35d | historical % deltas, ~5 weeks deep |
| `EarningsCalendar` | current window | `epsSurprisePercent` etc. for earnings-linked reasons |
| `impact1h`/`endDay`/`nextDay` | **0 filled** | impactWorker.ts exists, **not registered in PM2** |
| Universe | ~999 curated US names | honest framing: "tracked names", never "all US stocks" |

## MVP scope

### Pages (SSR + ISR)
1. `/` — today's board: Gainers | Losers tables, sort toggles
   % | market cap | RVOL | z-score. **Notable** (mcap ≥ $2B) default,
   **All tracked** toggle. Row: logo, ticker, name, % move, price,
   mcap, reason/context line, σ+RVOL chips, earnings badge.
2. `/movers/[symbol]` — per-ticker: today's move + reason/context +
   σ/RVOL + last ~30 daily moves (DailyRef) + historical σ-events
   (MoverEvent) + CTA → `premarketprice.com/analysis/[symbol]`.
   **Indexation gate**: `noindex` when the page is only ticker+price+
   generic text (no move context, no history substance).
3. `/week` — weekly board from DailyRef deltas, with explicit period
   definition in UI copy.

### Reason ladder (revised per review — distinguish cause/context/observation)

| Tier | Type | Render as |
|---|---|---|
| 1. `moversReason` (AI) | catalyst | "Reason: <text>" + category chip — only when plausibly tied to the move |
| 2. EarningsCalendar join | catalyst (auto) | "Reported earnings: EPS +12% vs est" — only if earnings event is within the move's causal window (reported today/yesterday BMO/AMC) |
| 3. Sector move | **context**, not cause | "Tech sector −3.1% today (48/52 tracked names down)" — labelled as context |
| 4. σ/RVOL anomaly | **observation** | "+8.0% on 5× volume — unusual move; no catalyst identified" |
| 5. Nothing | — | show data only, no fabricated text |

Each reason carries provenance: `type`, source, event time; only tier 1–2
may be labelled a catalyst/reason. Tiers 3–4 render under distinct
"Context" styling.

### DB layer (per review)
- `src/lib/data-contract.ts` — central module declaring required tables/
  columns/types; **contract test** run in CI + post-deploy smoke check
  against prod schema.
- All SQL centralized in one data layer; pages never inline SQL.
- `readonly: true` better-sqlite3; missing data degrades to
  "data currently unavailable", never crashes the page.

### Methodology (must be pinned before implementation)
- `lastChangePct` basis: **verify** = vs prior regular close.
- z-score: trailing-N-day |%| distribution (N from PMP code — verify).
- RVOL: today's volume vs trailing-N-day avg same-session volume — verify N.
- Week board = last 5 trading days, DailyRef prevClose→regularClose chain.
- Market-cap ranks: two views — **sort by mcap** within direction, and
  **mcap-impact** = mcap × |Δ%| (ranked "biggest market-value moves").

### SEO
- sitemap: `/`, `/week`, indexable `/movers/*`
- JSON-LD only for what pages actually represent (Dataset/ItemList on
  boards; nothing invented on thin pages)
- canonicals to self; `llms.txt` nice-to-have
- intent split vs PMP: PMP `/premarket-movers` = premarket session;
  GL `/` = full-day board; GL `/movers/X` = why-did-X-move; PMP
  `/analysis/X` = fundamentals

## Out of scope (phase 2+)
- impactWorker registration → "yesterday's movers today" fade board
- AI reason coverage extension to top ~30 daily movers (decide after
  overlap measurement vs existing ~45 σ-event reasons)
- Push alerts, session-split boards, deep date archives

## Parallel PMP task (separate deliverable, not blocking)
`impactWorker`: verify logic (reference time/price/session for each
impact field, idempotent writes, no-trade-day handling), test on a small
event set, then register in PM2/ecosystem with logging + restart policy.

## Acceptance criteria
1. Metric definitions documented in repo (`docs/methodology.md`) and
   matching PMP semantics exactly.
2. Contract test green in CI + post-deploy prod smoke check.
3. Reason ladder: no fabricated reasons; catalyst vs context vs
   observation visually distinct.
4. Thin `/movers/*` pages are `noindex`.
5. Board ↔ ticker-page ↔ PMP analysis links work both directions.
6. GA4 + GSC baseline captured at launch; 30d technical review,
   90d continue/kill decision.

## Execution order
1. Pin metric semantics in PMP code (this session)
2. impactWorker investigation + fix (parallel PMP deliverable)
3. Scaffold `~/Projects/gainerslosers` (port 3012, stockcv pattern)
4. Data layer + contract test
5. `/` daily board + reason ladder
6. `/movers/[symbol]`
7. `/week` + SEO plumbing
8. Deploy (nginx site, CI artifact deploy, GA4/GSC wiring)
