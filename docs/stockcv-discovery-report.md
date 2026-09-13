# StockCV — Discovery Report (Fáza 0)

**Dátum:** 2026-09-13
**Status:** Discovery only — žiadna implementácia. Čaká na rozhodnutia vlastníka (sekcia 10).

---

## 1. Executive Summary

StockCV má byť „životopis firmy" pre retailového používateľa: logo namiesto fotky,
dátum založenia / zamestnanci / sektor namiesto osobných údajov, a finančné výkazy
(súvaha, výkaz ziskov a strát, cash flow) ako sekcie dokumentu.

**Hlavný záver auditu:** ~90 % dát potrebných pre MVP už máme v databáze a na
produkcii beží infraštruktúra, ktorá ich udržiava čerstvé. StockCV je primárne
**nová prezentačná vrstva (UX/SEO)**, nie dátový projekt. Najväčšie medzery:
reálny „dátum založenia" (máme len IPO dátum), detail cash flow (dividendy,
buybacky) a milestone timeline.

---

## 2. Audit existujúceho stavu

### 2.1 Stack
- Next.js 16 (App Router, RSC) + React 19, TypeScript, Tailwind, recharts
- Prisma 5.22 + **SQLite** (súborová DB), Redis (cache), NextAuth 5 beta
- PM2 na VPS (89.185.250.213, port 3001), custom server `server.ts` + socket.io
- Deploy: push do `main` → GitHub Actions ssh-action → detached build na VPS

### 2.2 Dáta v DB relevantné pre StockCV (produkcia)

| Model | Obsah | Stav pokrytia |
|---|---|---|
| `Ticker` | symbol, name, sector, industry, **description, employees, websiteUrl, headquarters, logoUrl**, sharesOutstanding, price/mcap | ✅ plné |
| `FinancialStatement` | revenue, netIncome, ebit, grossProfit, **operatingCashFlow, capex**, totalAssets, totalLiabilities, currentAssets/Liabilities, retainedEarnings, totalEquity, sharesOutstanding, sbc, interestExpense, totalDebt, cashAndEquivalents, netPPE — **quarterly (Q1–Q3) + FY, od 2016** | ✅ ~700 tickrov, 684 s ≥4 výkazmi a všetkými 5 kľúčovými poľami |
| `AnalysisCache` | healthScore, profitabilityScore, valuationScore, **verdictText**, piotroskiScore, beneishScore, altmanZ, revenueCagr, netIncomeCagr, fcfMargin, marginStability, humanPeInfo, humanDebtInfo | ✅ |
| `FinnhubMetrics` | ~60 rád: marže, ROE/ROA/ROIC, rast, per-share, beta, dividendYield, payoutRatio, turnover | ✅ |
| `FinnhubProfile` | name, isin, cusip, exchange, currency, country, **ipoDate**, marketCap, shareOutstanding, logo, weburl, industry | ✅ |
| `FinnhubPriceTarget` / `FinnhubRecommendation` | analyst consensus + target | ✅ |
| `EarningsCalendar` | EPS/revenue estimate + actual + surprise % | ✅ |
| `DailyValuationHistory`, `ValuationHistory`, `ValuationPercentiles` | PE/PS/EV-EBITDA/FCF yield + percentily v čase | ✅ |

### 2.3 Sync infraštruktúra (už beží)
- `cron-finnhub-metrics-sync` — denne 03:00 UTC (metrics, profile, target, recommendation, insider)
- `cron-refresh-all` — týždenne (volá aj `syncFinancials` → Finnhub XBRL, 2016+, fallback stockanalysis.com pre ADR/zahraničné tickre)
- On-demand `syncFinancials` pri otvorení `/analysis/[ticker]`
- Polygon: ceny, snapshot, v3 reference details (description, employees, homepage, HQ, SIC→sector/industry), splity, market status

### 2.4 Existujúce stránky (potenciálna prekrývka)
- `/analysis/[ticker]` — CompanyOverview, HealthScores, AnalystConsensus, Earnings, RecentMoves, RelatedStocks, FAQ (FAQPage schema), SEO text, News
- `/financials/[ticker]` — výkazy + grafy (CashFlowChart, BalanceSheetTable, ShareDilutionChart, DebtCashChart), ISR 1 h, eligibility gate ≥4 výkazy
- `/valuation/[ticker]`, `/movers/[ticker]`, `/sectors/[sector]`, `/screener`, `/stocks`

---

## 3. Mapovanie CV metafory na dáta

| CV sekcia | Obsah | Zdroj | Stav |
|---|---|---|---|
| **Foto** | logo | `Ticker.logoUrl` / `FinnhubProfile.logo` | ✅ |
| **Meno + titul** | názov firmy + ticker | `Ticker.name` | ✅ |
| **Pozícia** | sektor + industry | `Ticker.sector/industry` | ✅ |
| **Kontakty** | web, HQ, burza, mena | `Ticker.websiteUrl/headquarters`, `FinnhubProfile.exchange/currency` | ✅ |
| **Osobné údaje** | dátum založenia, zamestnanci, veľkosť (mcap) | employees ✅, mcap ✅, **founding date ❌ (len IPO)** | ⚠️ |
| **Work experience (timeline)** | kvartálne revenue + net income v čase | `FinancialStatement` | ✅ |
| **Skills** | marže, ROIC, rast — ako „skill bary" s percentilom vs. sektor | `FinnhubMetrics` + `ValuationPercentiles` | ✅ |
| **Achievements** | healthScore, Piotroski, revenue CAGR, earnings surprise | `AnalysisCache` + `EarningsCalendar` | ✅ |
| **Credentials** | burza, index (S&P 500…), IPO dátum | `FinnhubProfile.ipoDate` + S&P500 skript existuje | ⚠️ (index flag treba pridať) |
| **References** | analyst consensus, price target | `FinnhubRecommendation/PriceTarget` | ✅ |
| **Výkazy (prílohy)** | P&L / Súvaha / Cash flow taby | `FinancialStatement` | ✅ (cash flow má len OCF+capex) |

---

## 4. Gap analýza (čo chýba)

1. **Dátum založenia (founding year)** — Polygon ani Finnhub ho nedávajú. Možnosti:
   Wikidata/Wikipedia pre top tickre, alebo manuálna kurácia, alebo použiť IPO dátum.
2. **Cash flow detail** — máme OCF + capex (→ FCF). Chýba: dividendy paid,
   buybacky, financing/investing breakdown. Polygon `v3/reference/dividends`
   (dividend history) je lacné doplnenie; buybacky vyžadujú cash flow detail
   (Finnhub premium / SEC XBRL rozšírenie existujúceho extractora).
3. **Index membership** (S&P 500 flag) — skript `add-sp500-tickers.ts` existuje,
   ale v `Ticker` schéme nie je flag → drobná migrácia.
4. **Milestones / career timeline** — udalosti typu IPO, splity (máme `EwCorporateAction`
   v PIT engine), akvizície. Pre MVP voliteľné.
5. **Segment/geo revenue** — len cez premium dáta; pre MVP vynechať.

**Žiadny z týchto gapov neblokuje MVP.**

---

## 5. Návrh dátového modelu

**MVP: 0 nových tabuliek.** Všetko sa skladá z existujúcich modelov.

Voliteľné rozšírenia (F2+):
- `Ticker.foundedYear Int?` + `foundedSource String?` (wikidata / manual)
- `Ticker.isSp500 Boolean @default(false)` (prípadne ďalšie indexy)
- `DividendHistory` (symbol, exDate, amount) — z Polygon dividends API

---

## 6. Návrh API / dátovej vrstvy

Odporúčanie: **bez nového REST API** — RSC server component číta priamo Prisma
(konzistentné s existujúcimi `/analysis`, `/financials`, `/valuation` stránkami),
ISR `revalidate = 3600`, Redis pre zdieľané agregáty.

Ak by mal existovať endpoint (napr. pre budúcu samostatnú appku stockcv.com):

```
GET /api/stockcv/[ticker]
  → { ticker, profile, statements(quarterly+annual), metrics,
      analysisCache, earnings(upcoming/recent), priceTarget,
      recommendation, dividends? }
  Cache: Redis 1 h + s-maxage
```

---

## 7. Návrh UX — layout StockCV stránky

```
┌──────────────────────────────────────────────────────┐
│ [LOGO]  Apple Inc. (AAPL)            ⭐ watchlist    │
│ „Senior Technology Company" — Technology / Consumer  │
│                                                       │
│ 📧 apple.com · 📍 Cupertino, CA · 🏛 NASDAQ · USD     │
│ 🎂 Founded/IPO: 1980 · 👥 ~164 000 · 💰 $3.4T mcap    │
├──────────────────────────────────────────────────────┤
│ VERDICT (plain language) — existing verdictText       │
│ Health 82/100 · Piotroski 7/9 · „Zdravá firma…"       │
├──────────────────────────────────────────────────────┤
│ 💼 EXPERIENCE — Revenue & Net Income timeline (chart) │
│    kvartálne stĺpce, YoY %, TTM marker                │
├──────────────────────────────────────────────────────┤
│ 🧠 SKILLS — skill bary s percentilom vs. sektor       │
│    Gross margin ████████░░ (top 15 % v sektore)       │
│    ROIC, Net margin, Revenue growth, FCF margin       │
├──────────────────────────────────────────────────────┤
│ 🏆 ACHIEVEMENTS — badge karty                         │
│    „Rast tržieb +16 % CAGR" · „Beat očakávaní 8/12"   │
├──────────────────────────────────────────────────────┤
│ 📜 REFERENCES — analyst consensus + price target      │
├──────────────────────────────────────────────────────┤
│ 📎 PRÍLOHY: [Výkaz ziskov] [Súvaha] [Cash flow]       │
│    zjednodušené retail tabuľky + „čo to znamená" text │
│    (pattern humanPeInfo/humanDebtInfo už existuje)    │
└──────────────────────────────────────────────────────┘
```

Znovu použiteľné komponenty: `ScoreCard`, `VerdictBanner`, `FinancialHealthTable`,
`BalanceSheetTable`, `FinancialChart`, `CashFlowChart`, `AddToWatchlist`,
`TickerFaqSection` (FAQPage schema), `generatePageMetadata`.

---

## 8. SEO / URL stratégia

| Varianta | URL | Plus | Mínus |
|---|---|---|---|
| A | `premarketprice.com/cv/[ticker]` | nulová infra, SEO autorita domény, rýchle | brand „stockcv" nie v URL |
| B | `premarketprice.com/stockcv/[ticker]` | ako A + keyword v URL | dlhšie |
| C | redesign `/analysis/[ticker]` | jedna silná stránka | riziko straty existujúcich rankingov |
| D | samostatná stockcv.com | plný brand | nová PM2 appka + nginx server block (zdieľaný nginx — citlivé!), nová SEO doména od nuly |

**Odporúčanie:** MVP ako A alebo B na existujúcej doméne (ISR + sitemap + llms.txt
update, OG image cez existujúci `opengraph-image.tsx` pattern). Kanibalizácia voči
`/analysis` a `/financials` sa rieši odlišným zámerom stránky (CV = evergreen
prehľad pre retail; analysis = aktuálna analýza) + interné prelinkovanie.

---

## 9. MVP rozsah a náročnosť

**F1 — MVP (odporúčané):**
- Stránka `/cv/[ticker]` (alebo `/stockcv/[ticker]`) pre tickre s ≥4 výkazmi (~684)
- CV layout: header (logo, „osobné údaje"), verdict, experience chart, skills,
  achievements, references, 3 výkazové taby
- 0 nových tabuliek, 0 nových ingestov; reuse komponentov
- Sitemap + metadata + FAQ schema
- Náročnosť: **S–M** (1–2 dev-dni ekvivalent; väčšina je kompozícia existujúceho)

**F2 — Enrichment:** foundedYear (Wikidata top ~100), dividendy (Polygon),
S&P500 flag, milestones timeline. Náročnosť: **M**.

**F3 — Brand/produkt:** rozhodnutie stockcv.com (samostatný Next.js app čítajúci
rovnakú DB read-only, nová PM2 appka, nový nginx server block), i18n, PDF export,
OG share images. Náročnosť: **M–L** (nginx zmeny opatrne — zdieľaný server).

**F4 — Rast:** porovnávanie CV („compare s peerom"), watchlist integrácia,
email/push digest.

**Riziká:** SQLite single-writer (read-only stránky OK), nginx zmeny pre novú
doménu (NEUPRAVOVAŤ nginx.conf — len nový server block v sites-enabled),
kvalita Wikidata founding dates, SEO kanibalizácia /analysis vs /cv.

---

## 10. Otvorené rozhodovacie otázky (čaká sa na vlastníka)

1. **Doména/brand MVP:** `premarketprice.com/cv/[ticker]` (rýchle) alebo hneď
   `stockcv.com` ako samostatný app?
2. **Vzťah k `/analysis/[ticker]`:** sesterská stránka s cross-linkmi, alebo
   dlhodobo nahradiť analysis CV formátom?
3. **Intenzita CV metafory:** plná (Experience/Skills/Achievements, hravý tón)
   vs. zdržanlivá (štandardný prehľad v CV štruktúre)?
4. **Jazyk:** EN only, alebo aj SK?
5. **Dátum založenia:** stačí IPO dátum (máme), alebo reálne founding year
   (Wikidata/manuál pre top tickre)?
6. **Pokrytie MVP:** top ~50 tickrov, všetkých ~684 eligible, alebo SSR on-demand
   pre ľubovoľný ticker s dátami?
7. **Výkazy v MVP:** plné tabuľky (quarterly/annual toggle), zjednodušené
   retail karty, alebo oboje?
8. **Nové dáta do MVP:** dividendy, index membership, milestones — áno/nie,
   ktoré?
9. **Monetizácia/CTA:** žiadna / ads / premium (porovnávanie, PDF export)?
10. **Nasadenie:** rovnaká PM2 appka vs. nová appka + nový nginx server block
    (vyžaduje opatrnosť so zdieľaným nginx)?

---

*Report generovaný ako Discovery Fáza 0. Implementácia začne až po odsúhlasení rozhodnutí vyššie.*
