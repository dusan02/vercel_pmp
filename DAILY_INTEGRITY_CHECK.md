# Daily Integrity Check (prevClose / % change / market cap / metadata)

This adds a daily validation job that checks, for all tickers:

- previous close exists and `Ticker.latestPrevCloseDate` matches the **last trading day** (ET calendar)
- % change is finite and broadly matches the computed value
- market cap and market cap diff are consistent (when shares + prevClose exist)
- sector/industry exist and are valid
- logo exists (either `Ticker.logoUrl` or local static file in `public/logos`)
- “stale price” detection based on `Ticker.lastPriceUpdated`

## Run locally (one-off)

From `pmp_prod/`:

```bash
npm run integrity:daily
```

With safe auto-fix (capped Polygon usage):

```bash
npm run integrity:daily -- --fix
```

If your runner eats flags, you can also use an env var:

```bash
INTEGRITY_FIX=1 npm run integrity:daily
```

### Important note (localhost)

If the Polygon worker is **not running**, the integrity check will correctly report:

- `stale_price`
- `stale_prev_close_date`

…because the DB hasn’t been refreshed.

## Run on server (PM2 cron)

`ecosystem.config.js` includes:

- `daily-integrity-check` with `cron_restart: "0 10 * * *"` (10:00 UTC).

This is chosen so it’s always **after** the worker’s ET bootstrap of previous closes (04:00 ET),
and it avoids DST complexity by staying on UTC.

Enable/update on server:

```bash
cd /var/www/premarketprice
pm2 restart ecosystem.config.js --update-env
pm2 status
```

Logs:

```bash
pm2 logs daily-integrity-check --lines 200
```

## Optional: API trigger (manual testing)

- `GET /api/cron/daily-integrity` (no auth, manual testing)
- `POST /api/cron/daily-integrity` (requires `Authorization: Bearer $CRON_SECRET_KEY`)

Use `?fix=true` to run with safe auto-fix.

