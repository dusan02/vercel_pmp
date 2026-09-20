# GPT review — nesúhlasy, vlastné návrhy, otvorené otázky

Living document. Zapisujem body, kde sa Devinova analýza líši od externých
GPT auditov (či už preto, že GPT hodnotil neaktuálny/indexovaný stav, alebo
mám odlišný produktový názor), a úlohy kde nie je jasné správne riešenie.

Pravidlo: GPT audity **nie sú autoritatívny opis live UI** — vždy najprv
overiť skutočný stav v kóde/produkcii.

---

## 1. Analysis page review (`/analysis/PM`)

### GPT netrafil
- Popisoval stránku **bez radaru** — radar je live v hero sekcii vpravo hore
  (na žiadosť užívateľa, nie defaultu).
- Hodnotil dáta, ktoré boli v čase auditu rozbité (ROE 575% pri negatívnom
  equity, dilution +56%, net margin mismatch) — jeho "dáta 9/10" ranking bol
  na corrupt číslach. Už opravené a deploynuté (`57d3c7d2`).

### Otvorené
- **EW Score formula audit** — transformácia 5-pillar → EW score zatiaľ bez
  auditu; externý review ju označil ako audit item. Nesúlazť s `overallScore`
  (priemer pilierov) — to sú dva rôzne produkty.
- **"Verdict" naming** — zvážiť "Model stance" / "Profile" namiesto
  verdict-framingu (radar má robiť profil, nie verdikt — rozhodnutie
  užívateľa z predošlého threadu).

---

## 2. Homepage / analysis tab review

### GPT netrafil
- Hodnotil **verejne indexované meta texty**, nie live app.
- Heatmapa **je** homepage (prvý default tab) — GPT ju považoval za chýbajúcu.
- Movers→Analysis loop (`onTileClick` → `handleMobileNavChange`) existuje.
- Search (`GlobalStockSearch`) existuje — ticker aj company name.
- "Killer features" 2, 5, 6 z jeho zoznamu = existujúci screener.

### Nesúhlasím / vlastný návrh
- **Nahradiť H1 "Track US Stocks Before the Market Opens"** — SEO riziko,
  premarket keywords nesú organic traffic. Môj návrh: H1 nechať, positioning
  doplniť do subheadline + "How we analyze" explainer (implementované).
  Finálne copy rozhodnutie je na užívateľovi.
- **"Today" dashboard s indexmi (S&P/Nasdaq/Dow)** — indexy nie sú v Ticker
  universe; nový dátový zdroj pre 3 čísla = zlý pomer cena/hodnota.
- **Default view = Valuation×Quality scatter** — pre retail používateľa
  abstraktné. Lepší default: Overall heatmap, scatter ako sekundárny view.
- **"Odmyslím dátové chyby"** — nemôže; rozbité dáta by score-map
  zdiskreditovali. Dáta sa najprv opravujú, potom sa stavia vizuál.

### Implementované z review
- "Fundamental Opportunities" strip (Q≥75 ∧ V≥55 ∧ O≥65, top 6 →
  `/analysis/[ticker]`).
- "How we analyze stocks" explainer (5 pilierov, server-rendered).

### Otvorené
- **Fundamental score heatmap** — dimension toggle (Overall/V/G/P/H/Q) na
  existujúcej treemape. Odblokované persistom pilierov, neimplementované.
- **Valuation×Quality scatter** — sekundárny view, až po trakcii heatmapy.

---

## 3. Screener review (`?tab=screener`)

### GPT netrafil (~40% "chýbajúcich" vecí existovalo)
- Reset all → `resetFilters` + `hasActiveFilters` (`useScreener.ts`).
- URL reprezentuje filter → query sync existuje.
- SEO landing pages → 10 `/screener/[slug]` leaderboardov už bežalo.
- Score stĺpce + row click → `/analysis/[ticker]` existovali.
- Market cap filter → `MARKET_CAP_PRESETS`.

### Nesúhlasím / vlastný návrh
- **AND/OR query builder** — power-user feature pre ~1% používateľov;
  komplikuje query layer aj UI. Presety pokryjú ~90% prípadov lacnejšie.
  Odložené (nie zamietnuté — ak bude dopyt, pridať).
- **Ďalších 30 raw metrík** — súhlas s GPT-ovým vlastným varovaním:
  5 pilierov + existujúce advanced filtre stačia.
- **Save screen cross-device** — vyžaduje účty; localStorage varianta je
  lacná v2. Odložené.
- **Historical valuation filter (P/E percentile ≤ 40)** — zaujímavé,
  `DailyValuationHistory` má dáta, ale vyžaduje precompute. V2.

### Implementované z review
- Persist `growthScore`/`qualityScore`/`overallScore` + indexy.
- `minGrowth`/`minQuality`/`minOverall` (+ max) filtre v API a UI.
- 5-dim score stĺpce, preset chips.
- Nové kombinované `/screener/[slug]` definície (quality-compounders,
  quality-at-reasonable-price, growth-at-reasonable-price, cash-machines,
  strong-balance-sheets, …) — automaticky v sitemape cez `LEADERBOARDS`.

### Otvorené
- **"Why it qualifies"** — zvýrazniť v row, ktoré filtre stock prešiel.
  Lacné, dobré pre UX. Čiastočne pokryté score stĺpcami, explicitný
  breakdown nie je.

---

## 4. Blog/Reports review

### GPT netrafil
- Tickery v reportoch **už linkujú** na `/analysis/TICKER`.
- Sentiment badge, NewsArticle JSON-LD, earnings-by-day — všetko existuje.
- `/api/blog/ai-insights` je **orphan route** — LLM interpretácia bola
  kedysi plánovaná, `OPENAI_API_KEY` v prode nie je, route nikde nevolaná.

### Nesúhlasím / vlastný návrh
- **LLM interpretácia reportov** — nie. Deterministický "Market takeaway"
  (template z existujúcich štatistík) je pre tento use-case lepší: žiadne
  halucinácie, žiadne API náklady, auditovateľné. ~50 riadkov logiky.
  Orphan `ai-insights` route vymazať.
- **URL migrácia `/blog/` → `/reports/`** — zbytočné SEO riziko; stačí
  rebrand labelu v navigácii (Blog → Reports), URL zostáva.
- Manuálne články / clickbait — súhlas s GPT, zabilo by dôveryhodnosť.

### Pending (odblokované persistom pilierov)
- Deterministický "Market takeaway" + "What moved" bloky v daily reporte.
- Nav label Blog → Reports (URL `/blog/` zostáva).
- Weekly earnings: "Key earnings" sekcia (large-cap top 5–8).
- "Stocks worth investigating" — top movers × Quality score join.

---

## 5. Favorites/Watchlist review (`?tab=favorites`)

### GPT netrafil
- Row click → `/analysis/[ticker]` **existuje** (`FavoritesSection` →
  `mobile-nav-change` event).
- Jeho navrhovaný Favorites/Portfolio split **už je realita** — Favorites
  nemá quantity; Portfolio má quantity, position value, daily P&L,
  sector/stock distribučné grafy.
- Predpokladá anonymný produkt — **auth existuje** (next-auth,
  `/api/user/favorites` DB sync pri login).
- Alerts prezentuje ako novú infra — **push + email pipeline beží**:
  `Subscription` tabuľka, `/api/notifications/subscribe|unsubscribe`,
  webpush + transporter, `notifyQualityBreakout` už odchádza. Chýbajú len
  per-ticker pravidlá + evaluator.

### Nesúhlasím / vlastný návrh
- **EW Score stĺpec vo Favorites** — EW score má coverage len cez quant
  import (podmnožina universe) → null hodnoty by vyzerali ako bug.
  Preferujem Overall + V + Q (plná coverage cez AnalysisCache), EW len
  keď existuje.
- **"Príliš jednoduchá na vlastnú položku navigácie"** — tab nav je lacná;
  skutočný problém je prázdny retention loop, nie miesto v navi.
- **Portfolio rozšírenie (avg cost, total P&L, dividendy, currency)** —
  transakčný ledger je väčší zásah; daily P&L + quantity stačia. Scope držať.
- **Alerts**: začať dvoma pravidlami (earnings ≤7 dní, score-change
  threshold) cez existujúci NotificationService — nie plný rule builder.

### Lacné upgrades (odblokované persistom pilierov)
- Score stĺpce (Overall/V/Q) — join `AnalysisCache` na favorite tickers.
- Earnings stĺpec — `EarningsCalendar` join.
- "Change since last visit" — localStorage snapshot diff, žiadny backend.
- Copy "Watchlist" reframing — kozmetické.

---

## 6. Movers 2.0 spec (`?tab=movers`)

### Čo špec predpokladal vs. realita
- "Add z-score / volume anomaly" — **už existuje**: worker počíta
  `latestMoversZScore` (log-return vs 20d σ) a `latestMoversRVOL`
  (expected-volume curve) per tick → DB. Špec §2/§4 = hotové.
- "Use Polygon indices for market context" — indices route je Yahoo-backed;
  AGENTS zakazuje Yahoo polling. **Market proxy = universe median**
  (všetky fresh `lastChangePct`), sector = median sektora (≥3 tickery).
- "Do not use an LLM" — LLM prose (`moversReason`, socialCopy) **zostáva**
  ako sekundárna vrstva z existujúceho `cron-movers-insights`;
  deterministická klasifikácia je record-of-truth pre
  category/confidence/evidence. Nezmazal som ho — produkčne sa osvedčil.
- "Persist mover analysis" — implementované **ephemeral** (Redis list cache
  90s + per-ticker news cache 15/30 min), nie DB stĺpec. Analysis je
  funkcia aktuálneho session okna; persistovanie by mrazilo stale
  kontext. Rate-limit bounded: deep catalyst detection len top-20.

### Odchýlky od špecu (vedomé)
- **Z-score ostáva own-20d** — market/sector sa nevnárajú do z (jak špec
  naznačuje "expected_return"), ale ako **excess move + attribution**
  (stock − max(sector, market)). Čistejšie a zlučiteľné s existujúcim
  worker pipeline.
- **Taby**: All / Most Unusual / Explained / Unexplained — vynechané
  "Biggest Movers" a "Volume" taby (significance ordering už kombinuje
  |z|+|chg|/2+rvol; |chg| sort = existujúci filter, RVOL tab má malú
  diferenciu voči "Most Unusual").
- **`attribution='unknown'`** (pridané navyše voči špecu) — keď chýba
  sector aj market comp (stale universe, víkend), nehlásime 'stock'.
- **EW score zobrazuje `totalScore/maxPossible` frakciu** (EW 52/65),
  konzistentne s `AnalysisHero`, nie normalizované na 100.

---

## 6b. Earnings review (`/earnings`)

### GPT netrafil
- **`percentChange` a `marketCap` už sú v schéme** `EarningsCalendar` aj v
  `EarningsSSRRow` — ale Finnhub `/calendar/earnings` sync ich **nikdy
  nezapisuje** (prod coverage 0/228). Nie je to chýbajúci stĺpec v UI,
  sú to dead columns → riešenie je read-time enrich (Ticker/DailyRef
  join), nie "pridať stĺpec".
- Surprise% sa **už renderuje**; link → `/analysis/TICKER` pre eligible
  tickery existuje; denné stránky `/earnings/date/[date]` existujú a
  prázdne dni majú `noindex` (dobrá SEO hygiena, nie "thin pages").
- Existujú **dve paralelné pipelines**: DB `EarningsCalendar` (Finnhub,
  všetky tickery) vs `/api/earnings-calendar` (Polygon, len 360 tracked,
  má marketCap/percentChange/fiscalPeriod). SSR stránky živí DB; Polygon
  route používa len `EarningsCalendar.tsx` komponent (home tab?).

### Vlastné rozhodnutia
- **Enrich pri čítaní** (`earningsSSR`), nie fix syncu — Ticker.marketCap
  je čerstvejší a nezávisí na crone.
- **Price reaction** = `DailyRef[symbol, date]`: `(regularClose −
  previousClose)/previousClose`; pre `amc` reporty je reakcia nasledujúci
  trading day → DailyRef nasledujúceho dňa. Honest "earnings-day move",
  nie live cena.
- **Volatility** = `Ticker.stdDevReturn20d` ako "typical daily move"
  proxy — implied move z options nemáme (žiadny options feed),
  "historical earnings-day move" je follow-up (per-event history join).
- **"Expected EPS growth"** vynechané — EarningsCalendar nemá
  predchádzajúci kvartál; FinancialStatement quarterly join je možný
  follow-up, ale nie v tomto batchi.
- **Featured ranking** = marketCap × (has estimates) — deterministic,
  nie "importance score" kombinujúci EW/pillars (tie sa zobrazujú vedľa,
  netvoria rank — vyhýba sa zdvojenému názoru "PMP hovorí že toto je
  dôležité").

### Edge: session=closed / víkend
- Movers route vracia `[]` mimo session (staleness guard 24h — pre-existing).
- Universe context má prázdne fresh rows → `marketChangePct=null`,
  `attribution='unknown'` — honest degradation, pipeline samotná beží
  (overené priamo na prod: WBD acquisition medium, ACN/PEP earnings).

---

## 7. Krížové poznámky

### Konvergencia troch auditov
Analysis page, heatmap a screener review všetky končili na rovnakom
blockeri: Growth/Quality nie sú persistované. Vyriešené (schema +
write-path + backfill 695/695, read/write parita overená na PM/GOOGL/NVDA).

### Read/write parity — ako overovať
`DEBUG_PILLARS=1` dumpuje pillar inputs v oboch cestách
(`analysisCompute.ts` + `scoreCalculator.ts`). `scripts/dbg-pillars.ts TICKER`
porovná read vs write na jednej DB. Povedzme divergence mimo PM:
- `take: 120` vs 10y filter v stmts query — `marginStability` môže u
  tickerov s >30y dát vyjsť inak, ale je to cached leg → konzistentné.
- `marketCap` má v write path extra `latestValuation.marketCap` fallback
  (pre Altman/verdict) — pillar legs používajú read-parity `mcapNow`.

### Rozhodnutia čakajúce na užívateľa
- **Positioning copy** (H1/hero) — SEO riziko vs. presnejší positioning;
  moje odporúčanie: augment, nie replace.
- **PM `forwardImpliedGrowth` = n/a** — Q1'26 stmt má po repaire
  `sharesOutstanding=null`, Finnhub nemá `netIncomePerShare`. Alternatíva:
  trusted Ticker count ako fallback pre *latest* statement v oboch cestách
  (radar G30→50). Zvolený konzervatívny variant (null sa nesubstituuje).
- **Save screen cross-device** — závisí na účtoch/auth rozhodnutí.
- **`overallScore` = plain mean** — možná váhovaná varianta neskôr;
  nezáleží na EW score pipeline (oddelené).
