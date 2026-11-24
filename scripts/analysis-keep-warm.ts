/**
 * Analysis page ISR pre-warm bot.
 *
 * Clicking a heatmap tile navigates to /analysis/[ticker]. When that page has
 * no ISR artifact yet (first visit, or right after a deploy — the `.next` swap
 * wipes every ISR file), the server must SSR it cold (~2–3 s, more under load).
 * Once an artifact exists, Next serves it instantly and revalidates in the
 * background (stale-while-revalidate, `revalidate = 60`).
 *
 * So this bot only renders pages that are MISSING an ISR artifact:
 *   1. ticker list straight from read-only SQLite (no HTTP dependency — the old
 *      `/api/stocks?limit=1000` fetch timed out under load and killed every run)
 *   2. ordered by market cap (largest heatmap tiles first)
 *   3. skip symbols whose `.next/server/app/analysis/SYM.html` already exists
 *   4. GET /analysis/SYM with low concurrency so the 2-core VPS isn't swamped
 *
 * Idempotent: if PM2 restarts it mid-sweep, the next run continues with the
 * still-missing pages only. Runs as PM2 cron and right after each deploy.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
// Keep concurrency at 1 + generous pause so post-deploy ISR warming doesn't
// saturate the 2-core VPS / Prisma connection_limit=1 queue and starve live APIs.
const CONCURRENCY = Math.max(1, Number(process.env.WARM_CONCURRENCY || 1));
const REQUEST_TIMEOUT_MS = 30_000;
const PAUSE_BETWEEN_MS = Math.max(150, Number(process.env.WARM_PAUSE_MS || 800));
const APP_DIR = process.cwd();
const ISR_DIR = path.join(APP_DIR, '.next', 'server', 'app', 'analysis');

function loadDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of ['.env', '.env.production', '.env.local']) {
    const p = path.join(APP_DIR, file);
    if (!fs.existsSync(p)) continue;
    const line = fs.readFileSync(p, 'utf8').split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

function resolveDbPath(): string {
  const url = loadDatabaseUrl() ?? 'file:./prisma/data/premarket.db';
  const raw = (url.startsWith('file:') ? url.slice(5) : url).split('?')[0]!.trim();
  return path.isAbsolute(raw) ? raw : path.resolve(APP_DIR, raw);
}

function loadTickers(): string[] {
  const db = new Database(resolveDbPath(), { readonly: true, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    const rows = db.prepare(
      'SELECT symbol FROM Ticker ' +
      'WHERE (inHeatmap = 1 OR symbol IN (SELECT symbol FROM AnalysisCache)) ' +
      'AND lastPrice > 0 ' +
      'ORDER BY lastMarketCap DESC NULLS LAST',
    ).all() as Array<{ symbol: string }>;
    return rows.map((r) => r.symbol).filter((s) => /^[A-Z0-9.\-]+$/.test(s));
  } finally {
    db.close();
  }
}

function hasIsrArtifact(symbol: string): boolean {
  return fs.existsSync(path.join(ISR_DIR, `${symbol}.html`));
}

async function warmPage(symbol: string): Promise<{ ok: boolean; ms: number; status: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/analysis/${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'user-agent': 'pmp-analysis-keep-warm/2.0' },
    });
    await res.arrayBuffer();
    return { ok: res.ok, ms: Date.now() - start, status: res.status };
  } catch {
    return { ok: false, ms: Date.now() - start, status: 0 };
  }
}

async function main() {
  const startTotal = Date.now();
  let tickers: string[];
  try {
    tickers = loadTickers();
  } catch (err) {
    console.error('❌ Analysis keep-warm: failed to read ticker list from SQLite:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const missing = tickers.filter((s) => !hasIsrArtifact(s));
  console.log(`🔥 Analysis keep-warm: ${tickers.length} tickers, ${missing.length} without ISR page — warming (concurrency ${CONCURRENCY})`);
  if (missing.length === 0) return;

  let warmed = 0;
  let failed = 0;
  let totalRenderMs = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < missing.length) {
      const symbol = missing[cursor++]!;
      const r = await warmPage(symbol);
      totalRenderMs += r.ms;
      if (r.ok) warmed++;
      else failed++;
      const done = warmed + failed;
      if (done % 50 === 0) {
        console.log(`   … ${done}/${missing.length} (avg ${Math.round(totalRenderMs / done)} ms/page, ${failed} failed)`);
      }
      await new Promise((res) => setTimeout(res, PAUSE_BETWEEN_MS));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const done = warmed + failed;
  console.log(
    `✅ Analysis keep-warm: ${warmed} pages warmed, ${failed} failed, avg ${done ? Math.round(totalRenderMs / done) : 0} ms/page, total ${Math.round((Date.now() - startTotal) / 1000)} s`,
  );
}

main().catch((err) => {
  console.error('❌ Analysis keep-warm crashed:', err);
  process.exit(1);
});
