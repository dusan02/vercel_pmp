# P1 backlog — Screener: filtre z Key Metrics dát

Rozhodnutie z 2026-09-21: NESCHAŤ implementovať počas STOP okna (2–3 dni).
Keď sa k tomu vrátime, je to rozšírenie existujúceho screenera, nie nový systém.

## Kontext / audit zistení

**Backend** `src/app/api/analysis/screener/route.ts` už podporuje:
score range filtre (health/profitability/valuation/growth/quality/overall,
min+max), `minAltman`, `minPiotroski`, `maxBeneish`, `minFcfMargin`,
`maxDebtRepayment`, `sector`, `industry`, `q`, `minMarketCap/maxMarketCap`,
sort + pagination. Fundamentals filtre idú cez `tickerWhere.analysisCache.is`.

**UI** `src/components/StockScreener.tsx` má Filters sekciu: search,
6 dual-range sliderov, sector/industry/market cap selecty, advanced row
(Altman, Piotroski, Beneish, FCF margin, Debt repay), quick-screen presety.

**Dátová vrstva `FinnhubMetrics`** — produkčné pokrytie (705 starých
tickerov; nových 295 z expansion doplní denný finnhub sync):

| Pole | Pokrytie |
|---|---|
| roe, netMargin, operatingMargin, debtEquityRatio, beta | ~698–703 |
| revenueGrowth, psRatio, pbRatio | ~695–698 |
| forwardPe, peRatio, currentRatio | ~655–683 |
| pegRatio, evEbitda, grossMargin | ~615–637 |
| earningsGrowth, dividendYield | ~551–597 |

Relácia `Ticker.finnhubMetrics` existuje → filter je
`tickerWhere.finnhubMetrics = { is: { roe: { gte } } }`. Žiadna migrácia.

## Prvá vlna filtrov (rozhodnuté, nie 15 naraz)

- ROE ≥
- P/E ≤ / ≥
- Forward P/E ≤ / ≥
- Dividend Yield ≥
- Revenue Growth ≥
- Debt/Equity ≤

Cieľový use-case: `ROE > 15% + Forward P/E < 25 + Revenue Growth > 10%`.

## Blocker pred implementáciou P/E filtra: sémantika

`finnhubMetrics.peRatio` môže sedieť na stale/innej EPS báze než náš
production P/E (vlastný TTM `metrics.currentPe` — MU: Finnhub 129x vs TTM
23x). Unified-source pravidlo v AGENTS.md zakazuje miešať bázy na jednej
stránke bez označenia.

Riešenie pri implementácii:
1. persistovať náš TTM `currentPe` do filtrateľného stĺpca
   (`AnalysisCache` alebo nová tabuľka) — čistá sémantika, pipeline zmena; alebo
2. filtrovať `finnhubMetrics.peRatio` — konzistentné s heatmapou (heatmap
   farbí z rovnakých polí, `heatmapFetcher.ts`), ale inkonzistentné s
   `/analysis` Key Metrics → potom explicitne labelovať bázu.

## Implementačné poznámky (keď sa k tomu vrátime)

- `route.ts`: nové query params + `finnhubMetrics.is` filter + rozšíriť
  cache key + `SCORE_FIELDS` (sorting) + include/select + response shape
- `useScreener.ts`: nové state + debounce + params
- `StockScreener.tsx`: nový "Fundamentals" riadok, rovnaký input pattern
  ako advanced row; voliteľné presety (High ROE, Dividend, Low P/E+ROE)
- Odhad: ~150–200 riadkov, bez migrácie, bez pipeline zmeny
- Product loop ktorý to uzatvára:
  Heatmap → Screener (ROE/P/E/growth) → Analysis → Valuation → Alert
