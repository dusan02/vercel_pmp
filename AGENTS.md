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

## Dátové zdroje cien

- **Polygon Starter ($29/mo) = 15-min delayed** — `lastTrade`/`lastQuote` v snapshotoch sú prázdné, len `min` bary oneskorené ~15 min. Real-time vyžaduje Advanced ($199/mo)
- **TradingView scanner overlay** (`src/workers/polygon/tradingviewOverlay.ts`): počas pre/live/after session merge-uje real-time `premarket_close`/`close`/`postmarket_close` do Polygon snapshotov pred normalize→upsert. Batch ~100 tickerov/POST, bez auth. Opt-out: `TV_OVERLAY=0`. Pri 429/chybách automaticky degraduje na Polygon-only (5min cooldown)
- **Yahoo neoficiálne API NEPOUŽÍVAŤ pre polling** — v7 quote aj v8 chart 429-ujú datacenter IP po ~10 requestoch (testované 2026-09-15)

## Verifikácia po deplloy

```bash
curl -sI https://www.premarketprice.com/heatmap | head -1   # očakávať 301 (www → non-www)
curl -s -o /dev/null -w '%{http_code}' https://premarketprice.com/llms.txt   # 200
curl -s https://premarketprice.com/analysis/AAPL | grep -c FAQPage           # ≥1
```

## Build & testy (lokálne)

- `npm run build` (Turbopack/webpack podľa next.config), `npx tsc --noEmit`, `npx jest`
- Lokálne bez Redis/DB: ticker stránky vracajú 404 (environmentálny limit, nie bug)
- **`next dev` (Turbopack) zlyháva na `globals.css`** — "Invalid empty selector" pri vnorenom `@supports` v `@media` (pre-existing, webpack build prejde). Na lokálny render smoke použi `npm run build` + `NODE_ENV=production npx tsx server.ts`

## Early Winners score pipeline

- **Tok**: quant engine (separátna Postgres PIT DB, `QUANT_DB_URL`) → `npm run quant:score -- --as-of <dátum> --json-out <súbor>` → JSON sa prenesie na VPS → `scripts/import-ew-scores.ts` upsertne do `EwScoreSnapshot` (SQLite) → renderuje `/screener/early-winners` + `PmpScoreSection` na `/analysis/[ticker]`
- Engine sa **NEIMPORTUJE** do Next runtime (`src/lib/quant` je mimo app tsconfig); hranica = JSON kontrakt `ew-score-export/1` (validácia v `src/lib/earlywinners/score-import.ts`)
- PM2: `cron-ew-score-import` denne 05:30 UTC, súbor cez `EW_EXPORT_PATH` (default `/var/www/premarketprice/data/ew-scores.json`) — importér bez súboru skončí exit 2, nič nerozbije
- Importer je idempotentný na `(symbol, asOfDate)`; tickery mimo `Ticker` tabuľky (delisted z frozen universe) preskočí — produkt ukazuje len live tickery
- Skóre sú **V5-B current-data** — EARNINGS stĺpec je BLOCKED (žiadne PIT consensus dáta), nikdy nie 0. Neprezentovať ako backtest ani V5-C výsledok
