/**
 * Daily traffic digest — one command, three quality tiers.
 *
 *   npm run traffic              → today
 *   npm run traffic -- --days 1  → yesterday
 *   npm run traffic -- --days 14 → last 14 days (GA4 only, nginx = today only)
 *   npm run traffic -- --skip-nginx
 *
 * Tiers (GA4):
 *   RAW      — every session GA4 recorded (includes farm/headless noise)
 *   RENDERED — sessions with a page_view. Our SPA sends page_view manually
 *              (send_page_view:false + GAListener on hydration), so a rendered
 *              session means a browser actually executed the app. NOTE: since
 *              ~2026-10-02 the farm also renders pages — rendered ≠ human.
 *   HUMAN~   — rendered minus farm signals: country in {Singapore, China,
 *              (not set)} or source in {(not set), (data not available)}.
 *              Residual proxy-farm inflation remains — treat as an estimate.
 *
 * Sources:
 *   GA4 via service account; nginx access.log on VPS — unique IPs that loaded
 *   an HTML page AND _next JS assets (real browser incl. adblock users GA4
 *   misses). Counted for TODAY only (log rotates at midnight).
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS (default ~/.config/pmp/gcp-service-account.json)
 *   GA4_PROPERTY_ID (default 517675266)
 *   PMP_SSH (default root@89.185.250.213)
 */
import { getAccessToken } from './lib/googleAuth';
import { execSync } from 'child_process';

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const hasFlag = (f: string) => process.argv.includes(f);

const PROPERTY = arg('--property', process.env.GA4_PROPERTY_ID ?? '517675266');
const DAYS = parseInt(arg('--days', '0'), 10);
const SSH = process.env.PMP_SSH ?? 'root@89.185.250.213';
const API = 'https://analyticsdata.googleapis.com/v1beta/properties';

interface Row {
  dims: string[];
  sessions: number;
  users: number;
  engaged: number;
  dur: number;   // avg session duration, s
  pvs: number;   // screen page views per session
}

async function ga4(token: string, dims: string[], limit = 100): Promise<Row[]> {
  const res = await fetch(`${API}/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
      dimensions: dims.map((name) => ({ name })),
      metrics: [
        { name: 'sessions' }, { name: 'totalUsers' },
        { name: 'engagedSessions' }, { name: 'averageSessionDuration' },
        { name: 'screenPageViewsPerSession' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit,
    }),
  });
  if (!res.ok) throw new Error(`GA4 ${dims.join('+')}: ${res.status} ${await res.text()}`);
  return ((await res.json()).rows ?? []).map((r: any) => ({
    dims: (r.dimensionValues ?? []).map((d: any) => String(d.value)),
    sessions: +r.metricValues[0].value,
    users: +r.metricValues[1].value,
    engaged: +r.metricValues[2].value,
    dur: Math.round(+r.metricValues[3].value),
    pvs: +(+r.metricValues[4].value).toFixed(1),
  }));
}

const FARM_SOURCES = new Set(['(not set)', '(data not available)']);
// SG = dominant scraping farm; CN/(not set) ≈ 0% engagement historically.
// Taiwan/HK kept — real users plausible. Direct source kept unless farm country.
const FARM_COUNTRIES = new Set(['Singapore', 'China', '(not set)']);
const suspicious = (source: string, country: string) =>
  FARM_SOURCES.has(source) || FARM_COUNTRIES.has(country);

function nginxBrowserIps(): number | null {
  try {
    const remoteScript = `grep premarketprice /var/log/nginx/access.log | grep -E "GET /_next/(static|chunks)" | awk '{print $1}' | sort -u > /tmp/_a.txt
grep premarketprice /var/log/nginx/access.log | grep -vE "GET /api/|GET /_next|GET /logos|GET /icons|/sw.js|manifest|favicon|sitemap|robots|llms|\\.png|\\.jpg|\\.svg|\\.ico|\\.css|\\.woff|/offline" | awk '{print $1}' | sort -u > /tmp/_p.txt
comm -12 /tmp/_a.txt /tmp/_p.txt | wc -l`;
    const out = execSync(`ssh ${SSH} 'bash -s'`, { input: remoteScript, encoding: 'utf8', timeout: 30000 });
    return parseInt(out.trim(), 10);
  } catch {
    return null;
  }
}

const wd = (iso: string) =>
  new Date(+iso.slice(0, 4), +iso.slice(4, 6) - 1, +iso.slice(6)).toLocaleDateString('en', { weekday: 'short' });

async function main() {
  const label = DAYS === 0 ? 'today' : `last ${DAYS} days`;
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);

  // [date, landingPage, sessionSource, country] — one query feeds daily tiers,
  // per-source quality and per-country tables.
  const [detail, srcMeta, pages] = await Promise.all([
    ga4(token, ['date', 'landingPage', 'sessionSource', 'country'], 250000),
    ga4(token, ['sessionSource'], 60),
    ga4(token, ['pagePath'], 25),
  ]);

  type Day = { raw: number; rendered: number; rendEng: number; human: number };
  const days: Record<string, Day> = {};
  const srcAgg: Record<string, { sess: number; rend: number; eng: number; human: number }> = {};
  const ctryAgg: Record<string, { rend: number; eng: number }> = {};

  for (const r of detail) {
    const [date, lp, src, country] = r.dims;
    const d = (days[date] ??= { raw: 0, rendered: 0, rendEng: 0, human: 0 });
    d.raw += r.sessions;
    const s = (srcAgg[src] ??= { sess: 0, rend: 0, eng: 0, human: 0 });
    s.sess += r.sessions; s.eng += r.engaged;
    if (lp === '(not set)') continue;
    const c = (ctryAgg[country] ??= { rend: 0, eng: 0 });
    d.rendered += r.sessions; d.rendEng += r.engaged;
    s.rend += r.sessions; c.rend += r.sessions; c.eng += r.engaged;
    if (!suspicious(src, country)) { d.human += r.sessions; s.human += r.sessions; }
  }

  console.log(`\n================ TRAFFIC — ${label} ================\n`);
  console.log('DAY          RAW  RENDERED  HUMAN~  ENG*');
  let t = { raw: 0, rendered: 0, rendEng: 0, human: 0 };
  for (const date of Object.keys(days).sort()) {
    const d = days[date];
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
    // Real rendered humans engage ~90%+ of the time; a large human−engaged gap
    // means rendered farm sessions slipped past the country/source filter.
    const farmLeak = d.human > d.rendEng * 2 + 5 ? '  ⚠farm-leak?' : '';
    console.log(
      `${iso} ${wd(date)} ${String(d.raw).padStart(5)}  ${String(d.rendered).padStart(6)}   ${String(d.human).padStart(5)}   ${String(d.rendEng).padStart(4)}${farmLeak}`,
    );
    for (const k of Object.keys(t) as (keyof Day)[]) t[k] += d[k];
  }
  const n = Object.keys(days).length || 1;
  console.log(`\nTOTAL raw ${t.raw} · rendered ${t.rendered} (${Math.round((100 * t.rendered) / (t.raw || 1))}%) · human~ ${t.human} (~${Math.round(t.human / n)}/day)`);
  console.log('*engaged = engaged sessions among rendered. HUMAN~ excludes SG/CN/(not set) country + (not set) source — still an estimate.');
  console.log('⚠farm-leak? = human~ ≫ engaged — since ~2026-10-02 the farm renders pages via proxies; treat HUMAN~ on flagged days as an upper bound.');

  const browserIps = DAYS === 0 && !hasFlag('--skip-nginx') ? nginxBrowserIps() : null;
  if (browserIps != null) {
    console.log(`\nNginx browser IPs today (page+JS loaded): ${browserIps}`);
    console.log('→ catches adblock users GA4 misses; compare with HUMAN~ above');
  }

  // Per-source quality — the lens for the Threads experiment (utm_source=threads
  // shows up as a "threads" source row; quality = rend% + eng + depth + dur).
  const meta = new Map(srcMeta.map((r) => [r.dims[0], r]));
  const srcRows = Object.entries(srcAgg)
    .filter(([, v]) => v.sess >= 2 || v.rend > 0)
    .sort((a, b) => b[1].sess - a[1].sess)
    .slice(0, 20);
  console.log('\nSOURCES (quality)');
  console.log('  source                   sess  rend%  eng  p/s   dur  human~');
  for (const [src, v] of srcRows) {
    const m = meta.get(src);
    const rendPct = Math.round((100 * v.rend) / v.sess);
    const flag = rendPct < 30 && v.sess > 10 ? '  ⚠farm?' : '';
    console.log(
      `  ${src.slice(0, 22).padEnd(24)} ${String(v.sess).padStart(4)}  ${String(rendPct).padStart(4)}% ${String(v.eng).padStart(4)} ${String(m?.pvs ?? 0).padStart(4)} ${String(m?.dur ?? 0).padStart(4)}s ${String(v.human).padStart(5)}${flag}`,
    );
  }

  console.log('\nCOUNTRIES (rendered only, excl. farm)');
  for (const [c, v] of Object.entries(ctryAgg).filter(([c]) => !FARM_COUNTRIES.has(c)).sort((a, b) => b[1].rend - a[1].rend).slice(0, 12))
    console.log(`  ${c.padEnd(24)} ${String(v.rend).padStart(4)} rend  ${String(v.eng).padStart(3)} eng`);

  console.log('\nTOP PAGES');
  for (const r of pages.slice(0, 15)) console.log(`  ${r.dims[0].slice(0, 44).padEnd(46)} ${String(r.sessions).padStart(4)} sess  ${String(r.engaged).padStart(3)} eng`);
  console.log('');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
