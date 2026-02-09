# VPS: Fixing `502 Bad Gateway` (nginx) for PremarketPrice

This app is deployed on a VPS behind **nginx** (reverse proxy) and runs via **PM2**.
`502 Bad Gateway` almost always means nginx cannot talk to the upstream app (wrong port, app crashed/restarting, or missing runtime deps).

## Quick checklist (most common)

1. **Node version**
   - The project expects **Node 20.x** (`package.json` engines: `>=20 <21`).
   - On the VPS:

```bash
node -v
```

2. **Install dependencies (including runtime)**
   - The PM2 ecosystem runs TypeScript via `tsx`, which must be installed on the VPS.
   - Run inside `/var/www/premarketprice`:

```bash
cd /var/www/premarketprice
npm install
```

3. **Build**

```bash
npm run build
```

4. **Restart PM2 using production env**

```bash
pm2 restart ecosystem.config.js --env production
pm2 status
```

5. **Verify the upstream is listening**

```bash
ss -lntp | grep ':3000' || true
curl -I http://127.0.0.1:3000/ | head -n 20
```

6. **Check logs**

```bash
pm2 logs premarketprice --lines 200
tail -n 200 /var/log/nginx/error.log
```

## Notes

- nginx is configured to proxy **`premarketprice.com` → `127.0.0.1:3000`**.
- If PM2 shows very high restart counts, the app is probably crashing during startup; PM2 logs will show the exact error.

