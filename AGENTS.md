# PMP — PreMarketPrice (premarketprice.com)

## Súvisiace projekty

- **StockCV** (`~/Projects/stockcv`, budúce stockcv.com, port 3011): samostatná Next.js appka, ktorá **read-only** číta PMP produkčnú DB (`better-sqlite3 readonly:true`, cesta cez `STOCKCV_DB`, na VPS `/var/www/premarketprice/prisma/data/premarket.db`). Nemá vlastnú pipeline ani secrets — PMP crony udržiavajú dáta čerstvé. Detaily v `stockcv/README.md`. Pri zmenách schémy PMP DB (rename/drop tabuliek `Ticker`, `FinancialStatement`, `AnalysisCache`, `FinnhubMetrics`, `EarningsCalendar`) skontrolovať aj `stockcv/src/lib/db.ts`.

## Deployment

- **VPS**: `root@89.185.250.213` (SSH key: `~/.ssh/id_ed25519`), app v `/var/www/premarketprice`, port 3001, PM2
- **Auto-deploy (artifact model)**: push do `main` → CI builduje `next build` (~2 min na runneri) a uploaduje `.next` ako artifact → `deploy.yml` ho stiahne, scp na VPS a `scripts/vps-activate.sh` atomicky swapne `.next` + `pm2 restart`. Na VPS sa NEBUILDUJE (~6–7 min end-to-end namiesto ~20 min)
- **Rollback**: predošlý build je v `.next.prev`; pri zlyhaní health/content checku sa vráti automaticky
- **Manuálny fallback deploy** (keď artifact pipeline zlyhá): `ssh root@89.185.250.213 'cd /var/www/premarketprice && bash scripts/vps-deploy.sh'` — builduje na VPS s `NODE_OPTIONS="--max-old-space-size=1536"` (heap cap kvôli OOM histórii)
- **Deploy mutex**: `/var/lock/pmp-deploy.lock` (flock) — druhý súbežný deploy (manuálny aj Actions) skončí namiesto race
- **NEUPRAVOVAŤ nginx.conf** — PMP config je v `/etc/nginx/sites-enabled/premarketprice.com`; nginx zdieľajú verifa.sk a earningstable.com
- Po deplloy sa nové PM2 cron appky registrujú cez `pm2 start ecosystem.config.cjs --only <name>` (restart alone nové joby nezaregistruje)

## Známe pasti

- **ISR cache-uje aj notFound/500-voľné rendery** — `catch { return null }` + `notFound()` mení transient DB chybu (napr. `prisma generate` počas aktivácie) na cache-ovanú 404. DB error má skončiť ako 500/throw, nie null→404. Rovnako sitemap: `catch→[]` v `getEligible*` produkuje cache-ovanú oklieštenú sitemap (guard v `sitemap.ts` throw-uje, aby ISR držal poslednú dobrú verziu)

- **pnpm v10 blokuje native build skripty** (better-sqlite3) → build padá na "Failed to collect page data". Server má byť na npm; `vps-deploy.sh` maže `node_modules/.pnpm` pri detekcii (one-time migration guard)
- **`pkill -f "next build"` v ssh-action skripte SA ZABÍJA** — ssh-action posiela celý skript ako argv shellu, takže literal pattern matchne vlastný shell → exit 143. Používaj bracket trick `[n]ext buil[d]` a nikdy nepíš process name do komentárov inline skriptu
- **Aktivácia beží detached** (setsid+nohup → `/var/log/pmp-deploy.log`, Actions poll-uje `=== Done ===`/`ACTIVATION_FAILED`) — synchrónne ssh sa ukázalo ako nespoľahlivé: session dropne a zabije inak úspešný deploy
- `prisma db push` NIKDY s `--accept-data-loss` na produkcii
- Sitemap aj blog majú ISR (`revalidate`) — po pridaní nových URL type over, či sitemap nie je statická
- Docs-only push: pridaj `[skip ci]` do commit message, inak spustí plný rebuild na VPS

## Server hardening (89.185.250.213, Debian 12)

- **fail2ban aktívny** (od 2026-09-13): sshd jail, systemd backend, `banaction = ufw`, maxretry 5 / findtime 10 m / bantime 1 h. Config: `/etc/fail2ban/jail.local`. Whitelist: `95.102.193.78` (userova dynamic IP — pri zmene IP sa ban self-heals po 1 h). Status: `fail2ban-client status sshd`
- GitHub Actions runner IP sa nikdy nezabanujú — auth je cez kľúč, žiadne failed attempts
- **OTVORENÉ: sshd povolené `PasswordAuthentication yes` + `PermitRootLogin yes`** — odporúčané zmeniť na `prohibit-password` (vyžaduje potvrdenie vlastníka — riziko lockoutu)
- **`NEXT_PUBLIC_*` hodnoty sa bake-ujú do bundle pri builde** — v CI ich má smoke-test job ako env (secrets `NEXT_PUBLIC_GA_ID`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` s public-literal fallbackmi — sú to verejné hodnoty z JS bundle). Pri pridaní novej `NEXT_PUBLIC_*` env treba ju doplniť aj do `ci.yml`, inak sa na produkcii potichu rozbije príslušná feature
- **`vps-deploy.sh` nereštartuje `pmp-polygon-worker`** — po zmene `src/workers/**` treba manuálne `ssh root@89.185.250.213 'pm2 restart pmp-polygon-worker'` (worker beží cez tsx, nepotrebuje Next build)

## Analytika (GSC/GA4) a traffic

- **Report skripty**: `scripts/gsc-report.ts` a `scripts/ga4-report.ts` cez SA kľúč `~/.config/pmp/gcp-service-account.json` (env `GOOGLE_APPLICATION_CREDENTIALS`). GA4 `PROPERTY_ID=517675266` (measurement `G-VQ1P6MDRRW`, v `.env.local` ako `GA4_PROPERTY_ID`). GA4 Admin API je v GCP projekte `47392532694` disabled — property ID sa nedá vylistovať programovo
- **GA4 reserved-param pasca (fixnuté 2026-09-20)**: parametre `source`/`medium`/`campaign` v `event()` prepisujú atribúciu celej session (164 sess/28d spadlo do "Unassigned" ako `heatmap / (not set)`). V eventoch používame `click_source` — pri pridávaní nových eventov nikdy neposielať rezervované názvy
- **~76 % GA4 "traffic" je scraping farma** (audit 2026-09-20): Singapore/Čína, `(direct)/(none)`, sessions bez pageviews — headless browseri + priame hity na `/api/stocks`, `/api/heatmap`, `/api/indices/*` (replayujú frontend cally, vidno v nginx access logu). Reálna návštevnosť ~30–40 sess/deň; hlavný organický zdroj = **Bing ~4× Google** (GSC ~8 klikov/28d, pos ~66); AI referrers (chatgpt/copilot/perplexity) ~70 sess/28d. Čitateľ GA4 reportov má vždy kontrolovať krajinu/pageviews, nie raw sessions

## Dátové zdroje cien

- **Polygon Starter ($29/mo) = 15-min delayed** — `lastTrade`/`lastQuote` v snapshotoch sú prázdné, len `min` bary oneskorené ~15 min. Real-time vyžaduje Advanced ($199/mo)
- **TradingView scanner overlay** (`src/workers/polygon/tradingviewOverlay.ts`): počas pre/live/after session merge-uje real-time `premarket_close`/`close`/`postmarket_close` do Polygon snapshotov pred normalize→upsert. Batch ~100 tickerov/POST, bez auth. Opt-out: `TV_OVERLAY=0`. Pri 429/chybách automaticky degraduje na Polygon-only (5min cooldown)
- **Yahoo neoficiálne API NEPOUŽÍVAŤ pre polling** — v7 quote aj v8 chart 429-ujú datacenter IP po ~10 requestoch (testované 2026-09-15)

## Verifikácia po deplloy

```bash
curl -sI https://www.premarketprice.com/heatmap | head -1   # očakávať 301 (www → non-www)
curl -s -o /dev/null -w '%{http_code}' https://premarketprice.com/llms.txt   # 200
curl -s https://premarketprice.com/analysis/AAPL | grep -c FinancialProduct  # ≥1 (JSON-LD stock schema)
```

## Build & testy (lokálne)

- `npm run build` (Turbopack/webpack podľa next.config), `npx tsc --noEmit`, `npx jest`
- Lokálne bez Redis/DB: ticker stránky vracajú 404 (environmentálny limit, nie bug)
- **`next dev` (Turbopack) zlyháva na `globals.css`** — "Invalid empty selector" pri vnorenom `@supports` v `@media` (pre-existing, webpack build prejde). Na lokálny render smoke použi `npm run build` + `NODE_ENV=production npx tsx server.ts`

## Early Winners score pipeline

- **Tok**: quant engine (separátna Postgres PIT DB, `QUANT_DB_URL`) → `npm run quant:score -- --as-of <dátum> --json-out <súbor>` → JSON sa prenesie na VPS → `scripts/import-ew-scores.ts` upsertne do `EwScoreSnapshot` (SQLite) → renderuje `/screener/early-winners` + minimalistickú `EW Score` bunku v Key Metrics na `/analysis/[ticker]`
- Engine sa **NEIMPORTUJE** do Next runtime (`src/lib/quant` je mimo app tsconfig); hranica = JSON kontrakt `ew-score-export/1` (validácia v `src/lib/earlywinners/score-import.ts`)
- PM2: `cron-ew-score-import` denne 05:30 UTC, súbor cez `EW_EXPORT_PATH` (default `/var/www/premarketprice/data/ew-scores.json`) — importér bez súboru skončí exit 2, nič nerozbije
- Importer je idempotentný na `(symbol, asOfDate)`; tickery mimo `Ticker` tabuľky (delisted z frozen universe) preskočí — produkt ukazuje len live tickery
- Skóre sú **V5-B current-data** — EARNINGS stĺpec je BLOCKED (žiadne PIT consensus dáta), nikdy nie 0. Neprezentovať ako backtest ani V5-C výsledok

## Key Metrics dátová vrstva (audit 2026-09)

**Unified-source pravidlá** (porušenie spôsobilo MU: P/E 129x Finnhub vs náš TTM 23x; FCF margin 29% TTM vs True FCF 1.9% FY):

- **P/E**: production source = vlastný TTM (`price × shares / TTM netIncome` v `computeMetrics` → `metrics.currentPe`). `finnhubMetrics.peRatio` je len diagnostika — môže sedieť na stale EPS báze. Rovnaký zdroj používa `scoreCalculator` (valuation score + percentile) aj `displayPeRatio` v `page.tsx` (hero, FAQ, schema)
- **Flow metriky**: Operating margin, CapEx/Rev, SBC/Rev, FCF margin, True FCF margin — všetky TTM cez `computeTTM` (polia `operatingCashFlow`, `capex`, `sbc` exportované v `ttm`). True FCF = `(TTM OCF − |TTM CapEx| − TTM SBC) / TTM Rev` = FCF margin − SBC/Rev
- **PEG**: Finnhub `pegRatio` sa zobrazuje len ak ich `peRatio` nediverguje >2× od nášho `currentPe` (iný basis → internally contradictory). Growth basis Finnhub PEG nie je zdokumentovaný — vlastný PEG neimplementovať bez vyjasnenia definície
- **Percentile text**: `formatPePercentile` v `scoreCalculator` — absolútne extrémy dostávajú explicitné wordingy, nikdy "top 0%"
- **Konzistencia chránená testom**: `src/__tests__/keyMetricsConsistency.test.ts` — reconciliácia P/E↔EPS, FCF↔True FCF, shared TTM báza, PEG suppression, percentile wording

**Dostupnosť dát** (prod DB, 2026-09):

| Položka | Stav | Zdroj |
|---|---|---|
| Denná história P/E, P/S, EV/EBIT, FCF yield | ✅ ~856K riadkov, 704 tickerov | `DailyValuationHistory` — **TTM báza** (od opravy 2026-09; predtým evEbitda/fcfYield annual) |
| Percentile vs vlastná história | ✅ `valuationHistoryStats` v `/api/analysis` response | `buildValuationHistory` + `summarizeSeries` v `services/analysis/valuationHistory.ts`; tooltipy v Key Metrics |
| Sector/industry mediány | ✅ derivable | agregácia `FinnhubMetrics` podľa `Ticker.sector` |
| EPS/FCF/EBITDA CAGR, share count, SBC história, ROIC/ROE trendy | ✅ | `FinancialStatement` (~43 periód/ticker) |
| Analyst price targets, recommendation counts | ⚠️ tabuľky existujú, **0 riadkov na prod** | `FinnhubPriceTarget`, `FinnhubRecommendation` — sync pipeline nenaplnená |
| Forward estimates | ⚠️ len ~26 riadkov s `epsEstimate` | `EarningsCalendar` |
| Precomputed percentiles | ⚠️ schéma existuje, 0 riadkov | `ValuationPercentiles` |
| Estimate revisions, one-off items, maint./growth capex split | ❌ žiadny zdroj | — |

`humanPeInfo`/`humanDebtInfo` sa renderujú z `AnalysisCache` — stale texty sa prepíšu refresh cyklom (POST `/api/analysis/[ticker]`).

**Historická valuation vrstva**:

- `computeTTMAtDate` vracia TTM pre všetky polia (NI, rev, EBIT, OCF, CapEx) — `syncValuationHistory` píše všetky 4 násobky na TTM báze
- **PO DEPLOYI spustiť na prod**: `npx tsx scripts/repair-valuation-history-ttm.ts` — prepočíta existujúce riadky na TTM (čistý lokálny recompute, žiadne API). Bez toho percentily pre evEbit/fcfYield rankujú TTM-current voči annual-histórii (mierne skreslené)
- Percentilový kontext je v metric tooltipoch (`histTip`), nie v layoute — žiadny UI redesign
- `metrics.evEbit` = vlastné EV/TTM-EBIT (D&A nemáme → EBIT, nie EBITDA); tabuľka labeluje `EV/EBIT`, Finnhub `evEbitda` ostáva fallback pod vlastným labelom
- `metrics.fcfYield` = vlastné TTM FCF/mcap (predtým annual snapshot — LLY: 0.3% → 1.2%)

## Pillar skóre (radar, 2026-09)

- **`src/services/analysis/pillars.ts` = jediná definícia** všetkých 5 osí (4 legs × 25): Valuation, Growth, Profitability, Health, Quality. Zdieľajú ju `scoreCalculator` (zapisuje stored `healthScore`/`profitabilityScore`/`valuationScore` do `AnalysisCache`) aj `computeMetrics` (read-time `pillars` v `/api/analysis` response — radar vždy na jednom as-of snapshotte)
- **Profitability NEOBSAHUJE revenue growth** — rast žije len v Growth osi (Rev/NI/EPS CAGR + fwd implied). Nové legs: ROIC, ROE, Net margin, Operating margin — vlastná TTM báza, Finnhub len fallback
- **Quality** = Piotroski + Beneish + FCF conversion + margin stability; SBC/dilution/negative-NI sú len risk flagy v Key Metrics, nie scoring legs
- Rebríkové prahy majú skutočnú nulu (žiadny `else 5` floor); chýbajúce dáta = 0 pts, výnimka: Valuation leg null → +10 a interestCoverage null → +25 (legacy konvencie, zachované zo scoreCalculatora)
- **`PillarsRadar.tsx`** = right rail top (`/analysis/[ticker]`), pure SVG, leg breakdown cez native `<title>` + `<details>`. Radar je PROFIL, nie verdict — žiadny overall score
- EW Score sa do radaru NEMIEŠA (quant timing signal, nie fundamental pillar) — ostáva bunkou v Scores riadku
- EW quant engine má vlastný feature `profitabilityScore` (SEC margin stability) — kolízia názvov, nesúvisí s `AnalysisCache.profitabilityScore`
- Stored `profitabilityScore` sa po deployi konverguje na novú definíciu cez refresh cyklus — počas prechodu screener/heatmap/leaderboards ukazujú mix starej/novej def; Scores riadok + radar používajú read-time pillars (vždy konzistentné)
- **Opravený unit bug**: `Ticker.lastMarketCap` je v MILIARDÁCH — `scoreCalculator` ho používal raw → stored `valuationScore` bol pre tickery s lastMarketCap nafúknutý (LLY 100 namiesto 40); zároveň `latestValuation` sa fetchoval len bez `lastPrice` → tickery bez lastMarketCap mali marketCap=0 (MU: 3 legs po +10). Oprava: `×1e9` + fetch podmienka `!lastPrice || !lastMarketCap`

## Feature freeze (od 2026-09-20 deploy `48637e31`)

Stav: **Ship → Measure → Learn**. Žiadny nový feature development kým neprejdú 30-dňové metriky (GSC CTR/positions, returning users, engagement per surface).

**Core funnel hypothesis (mierať, neoptimalizovať):** mover impression → mover click → Analysis visit → ďalšia akcia (ďalší ticker / favorite / return visit). Movers→Analysis CTR je metrika #0 — ak je nízky, problém nie je v features ale v tom, či ľudia chcú "prečo" za "čo sa hýbe". Ďalšie signály: Analysis→next-page rate, Mover→Favorite, alert signup (keď existuje), return rate.

**Post-freeze backlog (priorita):**
- P0/P1: identity/account layer (predpoklad alertingu) → alerting experiment; LIVE/DELAYED data transparency; EW freshness monitoring; missing-data score inflation (+10/+25 leg konvencie — correctness issue, nie feature)
- P2: sector-relative normalization; `/premarket/[symbol]` → Analysis/Movers linking; monetizácia

**Zakázané počas freeze:** nové piliere/radar vizuály, ďalšie stock page typy, AI chat, crypto/forex, mobile app, community, zložitejší portfolio tracker, SEO pages navyše.

**P0-lite: Twitter/X posting — broken pipe (audit 2026-09-20).** Cron `cron-post-social` (*/30, 13–22 Po–Pi) + `cron-movers-insights` bežia, `socialCopy` sa generuje, `TWITTER_*` credentials sú non-empty — ale **žiadny tweet nikdy nevyšiel**: OG image fetch padaa na `NEXT_PUBLIC_APP_URL` unset → `http://localhost:3000` → na :3000 beží verifa_frontend → 404 → throw pred X API. Fix (post-freeze, po pondelkovom smoke): pridať `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3001` do prod `.env` + `pm2 restart premarketprice` → jeden manuálny post cez `POST /api/cron/post-social` (Bearer `CRON_SECRET` — identická cesta ako cron; `GET` existuje len pre manual testing a deleguje na POST) → overiť tweet + OG media + analysis link + `redis-cli -p 6380 keys 'social:*'` (posted lock + quota). Potom zavrieť — žiadne nové templates/hashtagy/retry/analytics. Známe chyby (nechávame): `updateCronStatus` "success" ≠ tweet publikovaný; info logy strippuje `removeConsole`; dedup lock sa setuje až po poste (race okno); `NEXT_PUBLIC_APP_URL` sa používa iba v `socialDistributorService` — nastavenie je bezpečné. Metrika: tweet→Analysis CTR, nie follower count.

**Známe akceptované riziká (monitorovať, nefixovať):**
- TV overlay = ~60–80% batch coverage, zvyšok ticho na 15-min Polygon; zdravie = `⚡ TV overlay: N/M` lines v `polygon-worker-out-*.log`, 0 cooldownov
- `ew-scores.json` = externý manuálny export; importer beží denne, ale freshness závisí od upstream mtime — kontrolovať `ls -la data/ew-scores.json`
- SQLite single-writer — prvý scaling bottleneck pri raste traffic; migrácia na Postgres až pri dôkaze loadu
- Homepage SSR self-fetchuje vlastné API (`localhost:3001`) — náchylné na cold-start timeouty
