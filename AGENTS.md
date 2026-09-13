# PMP — PreMarketPrice (premarketprice.com)

## Súvisiace projekty

- **StockCV** (`~/Projects/stockcv`, budúce stockcv.com, port 3011): samostatná Next.js appka, ktorá **read-only** číta PMP produkčnú DB (`better-sqlite3 readonly:true`, cesta cez `STOCKCV_DB`, na VPS `/var/www/premarketprice/prisma/data/premarket.db`). Nemá vlastnú pipeline ani secrets — PMP crony udržiavajú dáta čerstvé. Detaily v `stockcv/README.md`. Pri zmenách schémy PMP DB (rename/drop tabuliek `Ticker`, `FinancialStatement`, `AnalysisCache`, `FinnhubMetrics`, `EarningsCalendar`) skontrolovať aj `stockcv/src/lib/db.ts`.

## Deployment

- **VPS**: `root@89.185.250.213` (SSH key: `~/.ssh/id_ed25519`), app v `/var/www/premarketprice`, port 3001, PM2
- **Auto-deploy**: push do `main` → CI → `.github/workflows/deploy.yml` (ssh-action)
- **Manuálny deploy** (keď GitHub Actions nefungujú): `ssh root@89.185.250.213 'cd /var/www/premarketprice && bash scripts/vps-deploy.sh'`
- Build beží na VPS s `NODE_OPTIONS="--max-old-space-size=1536"` (heap cap kvôli OOM histórii; server 8GB RAM + 4GB swap, zdieľaný s verifa.sk)
- **NEUPRAVOVAŤ nginx.conf** — PMP config je v `/etc/nginx/sites-enabled/premarketprice.com`; nginx zdieľajú verifa.sk a earningstable.com
- Po deplloy sa nové PM2 cron appky registrujú cez `pm2 start ecosystem.config.cjs --only <name>` (restart alone nové joby nezaregistruje)

## Známe pasti

- **pnpm v10 blokuje native build skripty** (better-sqlite3) → build padá na "Failed to collect page data". Server má byť na npm; `vps-deploy.sh` maže `node_modules/.pnpm` pri detekcii (one-time migration guard)
- **`pkill -f "next build"` v ssh-action skripte SA ZABÍJA** — ssh-action posiela celý skript ako argv shellu, takže literal pattern matchne vlastný shell → exit 143. Používaj bracket trick `[n]ext buil[d]` a nikdy nepíš process name do komentárov inline skriptu
- **Deploy beží detached (setsid+nohup)** a Actions job poll-uje — SSH session môže počas buildu padnúť; detached model to prežije
- `prisma db push` NIKDY s `--accept-data-loss` na produkcii
- Sitemap aj blog majú ISR (`revalidate`) — po pridaní nových URL type over, či sitemap nie je statická
- Docs-only push: pridaj `[skip ci]` do commit message, inak spustí plný rebuild na VPS

## Server hardening (89.185.250.213, Debian 12)

- **fail2ban aktívny** (od 2026-09-13): sshd jail, systemd backend, `banaction = ufw`, maxretry 5 / findtime 10 m / bantime 1 h. Config: `/etc/fail2ban/jail.local`. Whitelist: `95.102.193.78` (userova dynamic IP — pri zmene IP sa ban self-heals po 1 h). Status: `fail2ban-client status sshd`
- GitHub Actions runner IP sa nikdy nezabanujú — auth je cez kľúč, žiadne failed attempts
- **OTVORENÉ: sshd povolené `PasswordAuthentication yes` + `PermitRootLogin yes`** — odporúčané zmeniť na `prohibit-password` (vyžaduje potvrdenie vlastníka — riziko lockoutu)
- **Artifact-based deploy (build v CI)** je blokovaný: `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `NEXT_PUBLIC_BASE_URL` sa bake-ujú do bundle pri builde — CI by potreboval tieto hodnoty ako GitHub secrets, inak by sa na produkcii potichu rozbil GA tracking a push notifikácie. Kým sa nepridajú secrets, VPS build (detached model) je správny prístup

## Verifikácia po deplloy

```bash
curl -sI https://www.premarketprice.com/heatmap | head -1   # očakávať 301 (www → non-www)
curl -s -o /dev/null -w '%{http_code}' https://premarketprice.com/llms.txt   # 200
curl -s https://premarketprice.com/analysis/AAPL | grep -c FAQPage           # ≥1
```

## Build & testy (lokálne)

- `npm run build` (Turbopack/webpack podľa next.config), `npx tsc --noEmit`, `npx jest`
- Lokálne bez Redis/DB: ticker stránky vracajú 404 (environmentálny limit, nie bug)
