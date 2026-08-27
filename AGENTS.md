# PreMarketPrice — Project Notes

## Server Architecture
- **Server**: 89.185.250.213 (bardusa), 8GB RAM, 97GB disk
- **PMP**: Next.js app on PM2 (port 3001), PostgreSQL, Redis
- **verifa.sk**: Docker compose (frontend, worker, arq_worker, postgres, redis, browserless) on port 3000
- **Shared**: nginx reverse proxy for both domains

## Deploy
- `ssh root@premarketprice.com "cd /var/www/premarketprice && bash scripts/deploy-production.sh"`
- Deploy script stops PM2 → builds → restarts PM2 → reloads nginx
- **Build memory capped at 1.5GB** (`NODE_OPTIONS=--max-old-space-size=1536`) to prevent OOM kills on Docker containers
- **4GB swap** added to absorb peak RAM usage during build

## Known Issues (Resolved)
- **OOM killer killing verifa_arq_worker during PMP deploy**: Fixed by adding 4GB swap + capping next build heap at 1.5GB. Without swap, `next build` (~2-3GB RAM) filled the 8GB server and kernel OOM-killed the largest Docker container (arq_worker at ~2GB RSS).
