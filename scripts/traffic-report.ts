/**
 * Daily traffic digest — one command, both data sources.
 *
 *   npm run traffic              → today
 *   npm run traffic -- --days 1  → yesterday
 *   npm run traffic -- --days 7  → last 7 days (GA4 only, nginx = today only)
 *   npm run traffic -- --skip-nginx
 *
 * Sources:
 *   GA4 (sessions, sources, countries, pages) via service account
 *   nginx access.log on VPS — unique IPs that loaded an HTML page AND
 *   _next JS assets (a real-rendered browser; catches adblock users GA4
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

async function ga4(token: string, dim: string, limit = 30) {
  const res = await fetch(`${API}/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: dim }],
      metrics: [
        { name: 'sessions' }, { name: 'totalUsers' },
        { name: 'engagedSessions' }, { name: 'averageSessionDuration' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit,
    }),
  });
  if (!res.ok) throw new Error(`GA4 ${dim}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.rows ?? []).map((r: any) => ({
    dim: r.dimensionValues?.[0]?.value ?? '',
    sessions: +r.metricValues[0].value,
    users: +r.metricValues[1].value,
    engaged: +r.metricValues[2].value,
    avgDur: Math.round(+r.metricValues[3].value),
  }));
}

const FARM_SOURCES = new Set(['(not set)', '(data not available)']);
const FARM_COUNTRIES = new Set(['Singapore']);

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

async function main() {
  const label = DAYS === 0 ? 'today' : `last ${DAYS} days`;
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
  const [sources, countries, pages] = await Promise.all([
    ga4(token, 'sessionSource'), ga4(token, 'country'), ga4(token, 'pagePath', 25),
  ]);

  const total = sources.reduce((s: number, r: any) => s + r.sessions, 0);
  const farmSrc = sources.filter((r: any) => FARM_SOURCES.has(r.dim)).reduce((s: number, r: any) => s + r.sessions, 0);
  const farmCountry = countries.filter((r: any) => FARM_COUNTRIES.has(r.dim)).reduce((s: number, r: any) => s + r.sessions, 0);
  // Rough real estimate: exclude farm sources and farm-country sessions
  // (overlapping sets — union approximated as max + small overlap)
  const farmEst = Math.max(farmSrc, farmCountry) + Math.min(farmSrc, farmCountry) * 0.3;
  const realLow = Math.max(0, Math.round(total - farmEst));
  const realHigh = Math.max(0, total - Math.max(farmSrc, farmCountry));

  console.log(`\n================ TRAFFIC — ${label} ================\n`);
  console.log(`GA4 sessions: ${total}   (farm est: ~${Math.round(farmEst)})`);
  console.log(`Real humans (GA4-visible): ~${realLow}–${realHigh}`);

  const browserIps = DAYS === 0 && !hasFlag('--skip-nginx') ? nginxBrowserIps() : null;
  if (browserIps != null) {
    console.log(`Nginx browser IPs today (page+JS loaded): ${browserIps}`);
    console.log(`→ blended estimate incl. adblock users: ~${Math.round(realLow + browserIps * 0.25)}–${Math.round(realHigh + browserIps * 0.45)} humans`);
  }

  const ref = sources.filter((r: any) => !FARM_SOURCES.has(r.dim) && r.dim !== '(direct)');
  if (ref.length) {
    console.log('\nREFERRERS');
    for (const r of ref) console.log(`  ${r.dim.padEnd(24)} ${String(r.sessions).padStart(4)} sess  ${String(r.avgDur).padStart(5)}s avg`);
  }

  const realCountries = countries.filter((r: any) => !FARM_COUNTRIES.has(r.dim)).slice(0, 12);
  console.log('\nCOUNTRIES (excl. farm)');
  for (const r of realCountries) console.log(`  ${r.dim.padEnd(24)} ${String(r.sessions).padStart(4)} sess  ${String(r.engaged).padStart(3)} eng  ${String(r.avgDur).padStart(5)}s`);

  console.log('\nTOP PAGES');
  for (const r of pages.slice(0, 15)) console.log(`  ${r.dim.slice(0, 44).padEnd(46)} ${String(r.sessions).padStart(4)} sess  ${String(r.engaged).padStart(3)} eng`);
  console.log('');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
