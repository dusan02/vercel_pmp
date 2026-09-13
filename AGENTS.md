# PMP — PreMarketPrice (premarketprice.com)

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
- **Deploy beží detached (setsid+nohup)** a Actions job poll-uje — SSH session môže počas buildu padnúť (server je pod masívnym SSH brute-force floodom); detached model to prežije
- `prisma db push` NIKDY s `--accept-data-loss` na produkcii
- Sitemap aj blog majú ISR (`revalidate`) — po pridaní nových URL type over, či sitemap nie je statická
- Docs-only push: pridaj `[skip ci]` do commit message, inak spustí plný rebuild na VPS

## Verifikácia po deplloy

```bash
curl -sI https://www.premarketprice.com/heatmap | head -1   # očakávať 301 (www → non-www)
curl -s -o /dev/null -w '%{http_code}' https://premarketprice.com/llms.txt   # 200
curl -s https://premarketprice.com/analysis/AAPL | grep -c FAQPage           # ≥1
```

## Build & testy (lokálne)

- `npm run build` (Turbopack/webpack podľa next.config), `npx tsc --noEmit`, `npx jest`
- Lokálne bez Redis/DB: ticker stránky vracajú 404 (environmentálny limit, nie bug)
