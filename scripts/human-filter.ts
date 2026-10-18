/**
 * Human-filter — separates real humans from bots/farm in nginx logs.
 *
 *   npm run traffic:humans                      → text funnel for yesterday
 *   npm run traffic:humans -- --days 5          → text funnel, 5 days ago
 *   npm run traffic:humans -- --chart           → HTML chart, last 8 days
 *   npm run traffic:humans -- --chart --days 5  → HTML chart, last 5 days
 *   npm run traffic:humans -- --skip-enrich     → no ip-api lookup (faster)
 *   npm run traffic:humans -- --chart --no-open → write file, don't open
 *
 * Why this exists: the simple "js+referer" browser-IP count (traffic:all) lets
 * the rendering farm through — PMP showed 430 browser IPs vs 33 GA4 engaged.
 * This adds three filters on top:
 *
 *   1. Per-IP behavior (awk on VPS, streamed back as TSV):
 *      human candidates fetched ≥1 HTML page, ≥1 .js asset WITH the site's
 *      referer, zero crawler-UA lines, and sane activity (≥3 assets or ≥10 s
 *      dwell or ≥2 pages). Scrapers pulling asset URLs directly have no
 *      referer; pure-HTML crawlers never fetch JS.
 *   2. ASN/hosting/proxy enrichment via ip-api.com /batch (100 IPs per call,
 *      results cached in ~/.cache/pmp-ipinfo.json): hosting==true, proxy==true
 *      or a datacenter ASN (Amazon/Google/Hetzner/OVH/M247/DataCamp/…) → not
 *      human. This is the farm killer — residential-proxy IPs leak less than
 *      datacenter ranges but `proxy` catches most known proxy nets.
 *   3. GA4 engaged cross-check (PMP only) — sanity anchor for the final number.
 *
 * Chart mode: sweeps the rotated nginx logs (retention ~8 days) for per-day
 * humans~ per site, overlays the 28-day PMP GA4 trend (engaged + human~) and a
 * requests-volume panel, writes a self-contained HTML file and opens it.
 *
 * Output funnel per site: rendered → behavioral → residential → humans~.
 * "humans~" = unique human IPs/day — closest log-based proxy to visitors
 * (CGNAT undercounts, rotating proxies overcount). Upper bound vs GA4 engaged.
 *
 * NOTE: ip-api.com free tier is rate-limited (~45 req/min) and intended for
 * non-commercial use — for heavy use swap in a local GeoLite2-ASN mmdb.
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS, GA4_PROPERTY_ID, PMP_SSH.
 */
import { getAccessToken } from './lib/googleAuth';
import { getFarmCidrs, buildFarmRanges, asnOf } from './lib/farm-asn.mjs';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const hasFlag = (f: string) => process.argv.includes(f);

const CHART = hasFlag('--chart');
const DAYS = parseInt(arg('--days', CHART ? '8' : '1'), 10);
const SKIP_ENRICH = hasFlag('--skip-enrich');
const NO_OPEN = hasFlag('--no-open');
const SSH = process.env.PMP_SSH ?? 'root@89.185.250.213';
const PMP_PROPERTY = process.env.GA4_PROPERTY_ID ?? '517675266';
const SELF_IPS = new Set(['89.185.250.213', '95.102.193.78']);
const CACHE_FILE = path.join(os.homedir(), '.cache', 'pmp-ipinfo.json');
const CACHE_TTL = 30 * 86400_000;
const SITES = ['PMP', 'ET', 'VERIFA', 'STOCKCV', 'GL'] as const;
type Site = (typeof SITES)[number];

const DC_ASN = /amazon|aws|google|microsoft|azure|hetzner|ovh|digitalocean|alibaba|tencent|oracle|vultr|linode|akamai|cloudflare|m247|datacamp|kamatera|scalaxy|worldhoster|leaseweb|contabo|servers?\.com|ionos|scaleway|upcloud|cogent|zayo|gtt|choopa|constant|hosting|datacenter|servermania|nucleus|kyivstar data|ip-?only networks/i;

// ---------------- remote aggregation ----------------
// One awk pass per (log, day) → TSV: ip, total, pages, assets, jsReferer, spanSec, botLines
function remoteAggregate(dayIdxs: number[]): Record<Site, Map<number, IpRow[]>> {
  const list = dayIdxs.join(' ');
  const sh = `
cd /var/log/nginx || exit 1
emit() {
  local BASE=$1 DOM=$2 D=$3 F DATE
  if [ "$D" = "0" ]; then F="$BASE"; elif [ -f "$BASE.$D" ]; then F="$BASE.$D"; else F="$BASE.$D.gz"; fi
  [ -f "$F" ] || return 0
  DATE=$(date -d "$D days ago" +%d/%b/%Y)
  zcat -f "$F" 2>/dev/null | grep -F "[$DATE" | awk -v dom="$DOM" '
    BEGIN{
      asset="(/api/|/_next|/static/|/logos|/icons|/assets|\\\\.js|\\\\.css|\\\\.png|\\\\.jpe?g|\\\\.svg|\\\\.ico|\\\\.woff|\\\\.ttf|\\\\.webp|\\\\.gif|\\\\.txt|\\\\.xml|\\\\.json|/sw\\\\.js|manifest|favicon|sitemap|robots|llms|/offline|\\\\.env|\\\\.php|wp-|/vendor/|/\\\\.git|\\\\.map)"
      botua="(googlebot|bingbot|semrush|ahrefs|claudebot|gptbot|bytespider|petal|exabot|exasearch|meta-external|applebot|duckduckbot|yandex|baiduspider|mj12|dotbot|screaming|headless|slurp|sistrix|crawler|spider|bot/)"
      jsext="\\\\.js($|\\\\?)"
      assetext="\\\\.(js|css|woff2?|ttf|png|jpe?g|svg|webp|gif|ico)($|\\\\?)"
    }
    {
      split($0, q, "\\"")
      req=q[2]; ref=q[4]; ua=tolower(q[6])
      if (req !~ /^GET /) next
      gsub(/^GET /,"",req); sub(/ .*/,"",req); path=req
      ip=$1
      ts=0
      if (match($0, /:[0-9][0-9]:[0-9][0-9]:[0-9][0-9] /)) {
        s=substr($0,RSTART+1,8); split(s,t,":"); ts=t[1]*3600+t[2]*60+t[3]
      }
      n[ip]++
      if (!(ip in first)) first[ip]=ts; last[ip]=ts
      if (ua ~ botua) bt[ip]++
      if (path !~ asset) pg[ip]++
      if (path ~ jsext && ref ~ dom) jr[ip]++
      if (path ~ assetext || path ~ /_next|\\/static\\//) as_[ip]++
    }
    END{
      for (ip in n) {
        span=last[ip]-first[ip]; if (span<0) span+=86400
        printf "%s\\t%d\\t%d\\t%d\\t%d\\t%d\\t%d\\n", ip, n[ip], pg[ip]+0, as_[ip]+0, jr[ip]+0, span, bt[ip]+0
      }
    }'
}
for d in ${list}; do
  echo "===PMP|$d===";     emit access.log                 premarketprice $d
  echo "===ET|$d===";      emit earnings-table.access.log  earningstable  $d
  echo "===VERIFA|$d===";  emit verifa_perf.log            verifa         $d
  echo "===STOCKCV|$d==="; emit stockcv.access.log         stockcv        $d
  echo "===GL|$d===";      emit gainerslosers.access.log   gainerslosers  $d
done
`;
  const out = execSync(`ssh ${SSH} 'bash -s'`, { input: sh, encoding: 'utf8', timeout: 300000, maxBuffer: 256 * 1024 * 1024 });
  const res = Object.fromEntries(SITES.map((s) => [s, new Map<number, IpRow[]>()])) as Record<Site, Map<number, IpRow[]>>;
  let curSite: Site | null = null;
  let curDay = 0;
  for (const line of out.split('\n')) {
    const m = line.match(/^===(PMP|ET|VERIFA|STOCKCV|GL)\|(\d+)===$/);
    if (m) { curSite = m[1] as Site; curDay = +m[2]; res[curSite].set(curDay, []); continue; }
    if (!curSite || !line) continue;
    const [ip, n, pages, assets, jsref, span, bot] = line.split('\t');
    res[curSite].get(curDay)!.push({ ip, n: +n, pages: +pages, assets: +assets, jsref: +jsref, span: +span, bot: +bot });
  }
  return res;
}

type IpRow = { ip: string; n: number; pages: number; assets: number; jsref: number; span: number; bot: number };

// ---------------- ip-api enrichment (cached) ----------------
type IpInfo = { cc?: string; as?: string; isp?: string; mobile?: boolean; proxy?: boolean; hosting?: boolean; ts: number };

function loadCache(): Record<string, IpInfo> {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveCache(c: Record<string, IpInfo>) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c));
}

async function enrich(ips: string[]): Promise<Record<string, IpInfo>> {
  const cache = loadCache();
  const now = Date.now();
  // Farm-CIDR hits are already classified — don't burn ip-api quota on them.
  const missing = ips.filter((ip) => asnOf(ip, FARM_RANGES) == null && (!cache[ip] || now - cache[ip].ts > CACHE_TTL));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const res = await fetch('http://ip-api.com/batch?fields=status,query,countryCode,as,isp,mobile,proxy,hosting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) { console.error(`ip-api ${res.status} — continuing unenriched`); break; }
    for (const r of (await res.json()) as any[]) {
      if (r.status !== 'success') continue;
      cache[r.query] = { cc: r.countryCode, as: r.as, isp: r.isp, mobile: !!r.mobile, proxy: !!r.proxy, hosting: !!r.hosting, ts: now };
    }
    if (i + 100 < missing.length) await new Promise((r) => setTimeout(r, 1400));
  }
  saveCache(cache);
  return cache;
}

// ---------------- classification ----------------
// Local farm-ASN CIDR ranges (RIPEstat-backed, cached) — filters the big
// render-farms even when ip-api rate-limits the enrichment call.
let FARM_RANGES: [number, number, number][] = [];

const isCandidate = (r: IpRow) => r.jsref >= 1 && r.pages >= 1 && r.bot === 0 && !SELF_IPS.has(r.ip);
const behaviorOk = (r: IpRow) => r.assets >= 3 || r.span >= 10 || r.pages >= 2;
const isDc = (info?: IpInfo) => !!info && (info.hosting || info.proxy || DC_ASN.test(`${info.as} ${info.isp}`));
const isDcIp = (ip: string, info?: IpInfo) => isDc(info) || asnOf(ip, FARM_RANGES) != null;

function funnel(rows: IpRow[], info: Record<string, IpInfo>) {
  const cand = rows.filter(isCandidate);
  const behave = cand.filter(behaviorOk);
  const humans = behave.filter((r) => !isDcIp(r.ip, info[r.ip]));
  const dc = behave.filter((r) => isDcIp(r.ip, info[r.ip]));
  return { cand, behave, humans, dc };
}

function reportSite(label: string, rows: IpRow[], info: Record<string, IpInfo>) {
  const { cand, behave, humans, dc } = funnel(rows, info);
  const dcAsns: Record<string, number> = {};
  for (const r of dc) {
    const farm = asnOf(r.ip, FARM_RANGES);
    const asn = farm != null ? `AS${farm} farm` : (info[r.ip]?.as ?? info[r.ip]?.isp ?? 'unknown').split(' ').slice(0, 3).join(' ');
    dcAsns[asn] = (dcAsns[asn] ?? 0) + 1;
  }
  const countries: Record<string, number> = {};
  for (const r of humans) countries[info[r.ip]?.cc ?? '??'] = (countries[info[r.ip]?.cc ?? '??'] ?? 0) + 1;

  console.log(`${label}`);
  console.log(`  rendered candidates (page+js+ref, no bot-UA): ${cand.length}`);
  console.log(`  − weak behavior (no asset graph / 0 dwell / single hit): −${cand.length - behave.length}`);
  console.log(`  − datacenter/proxy ASN: −${dc.length}${dc.length ? `   [${Object.entries(dcAsns).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, c]) => `${a}×${c}`).join(', ')}]` : ''}`);
  console.log(`  = HUMANS~ ${humans.length}` + (humans.length ? `   (countries: ${Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${c}:${n}`).join(' ')})` : ''));
  return humans.length;
}

// ---------------- GA4 ----------------
async function ga4Tiers(days: number): Promise<Record<string, { eng: number; human: number; raw: number }>> {
  const FARM_SOURCES = new Set(['(not set)', '(data not available)']);
  const FARM_COUNTRIES = new Set(['Singapore', 'China', '(not set)']);
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PMP_PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }, { name: 'landingPage' }, { name: 'sessionSource' }, { name: 'country' }],
      metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }],
      limit: 250000,
    }),
  });
  if (!res.ok) throw new Error(`GA4 ${res.status}`);
  const days2: Record<string, { eng: number; human: number; raw: number }> = {};
  for (const r of (await res.json()).rows ?? []) {
    const [date, lp, src, country] = (r.dimensionValues ?? []).map((d: any) => String(d.value));
    const sess = +r.metricValues[0].value;
    const eng = +r.metricValues[1].value;
    const d = (days2[date] ??= { eng: 0, human: 0, raw: 0 });
    d.raw += sess;
    if (lp === '(not set)') continue;
    d.eng += eng;
    if (!FARM_SOURCES.has(src) && !FARM_COUNTRIES.has(country)) d.human += sess;
  }
  return days2;
}

// ---------------- HTML chart ----------------
const SITE_COLOR: Record<Site, string> = { PMP: '#3b82f6', VERIFA: '#f59e0b', ET: '#9ca3af', STOCKCV: '#8b5cf6', GL: '#10b981' };

type DaySeries = { date: string; label: string; humans: Record<Site, number>; requests: Record<Site, number>; ga4Eng: number | null; ga4Human: number | null; partial: boolean };

function buildChartHtml(series: DaySeries[]): string {
  const W = 1080, ML = 48, MR = 14, P1T = 44, P1H = 250, P2T = P1T + P1H + 34, P2H = 110, PB = 26;
  const H = P2T + P2H + PB;
  const plotW = W - ML - MR;
  const n = series.length;
  const slot = plotW / n;
  const barW = slot * 0.6;
  const x = (i: number) => ML + i * slot + slot / 2;

  const maxHumans = Math.max(10, ...series.map((d) => SITES.reduce((s, k) => s + d.humans[k], 0)), ...series.map((d) => d.ga4Human ?? 0));
  const maxReq = Math.max(1, ...series.map((d) => SITES.reduce((s, k) => s + d.requests[k], 0)));
  const y1 = (v: number) => P1T + P1H - (v / maxHumans) * P1H;
  const y2 = (v: number) => P2T + P2H - (v / maxReq) * P2H;

  const svg: string[] = [];
  svg.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif,system-ui,sans-serif">`);
  svg.push(`<text x="${ML}" y="24" font-size="15" font-weight="600" fill="#111">Reálni návštevníci (humans~, nginx ASN+behavior filter) vs. PMP GA4</text>`);

  // panel 1 gridlines + y labels
  for (let g = 0; g <= 4; g++) {
    const v = (maxHumans * g) / 4;
    svg.push(`<line x1="${ML}" x2="${W - MR}" y1="${y1(v)}" y2="${y1(v)}" stroke="#e5e7eb"/>`);
    svg.push(`<text x="${ML - 6}" y="${y1(v) + 4}" font-size="10" fill="#9ca3af" text-anchor="end">${Math.round(v)}</text>`);
  }
  // panel 2 gridline
  svg.push(`<line x1="${ML}" x2="${W - MR}" y1="${y2(0)}" y2="${y2(0)}" stroke="#e5e7eb"/>`);
  svg.push(`<text x="${ML - 6}" y="${y2(maxReq) + 4}" font-size="10" fill="#9ca3af" text-anchor="end">${maxReq >= 1000 ? `${(maxReq / 1000).toFixed(0)}k` : maxReq}</text>`);
  svg.push(`<text x="${ML - 6}" y="${y2(0) + 4}" font-size="10" fill="#9ca3af" text-anchor="end">0</text>`);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  series.forEach((d, i) => {
    // stacked bars: PMP bottom, VERIFA mid, ET top
    let acc = 0;
    for (const site of SITES) {
      const v = d.humans[site];
      if (v <= 0) continue;
      const yTop = y1(acc + v);
      svg.push(`<rect x="${x(i) - barW / 2}" y="${yTop}" width="${barW}" height="${y1(acc) - yTop}" fill="${SITE_COLOR[site]}"${d.partial ? ' opacity="0.55"' : ''}><title>${d.label} ${site}: ${v} humans~</title></rect>`);
      acc += v;
    }
    // requests bars (panel 2)
    let acc2 = 0;
    for (const site of SITES) {
      const v = d.requests[site];
      if (v <= 0) continue;
      const yTop = y2(acc2 + v);
      svg.push(`<rect x="${x(i) - barW / 2}" y="${yTop}" width="${barW}" height="${Math.max(1, y2(acc2) - yTop)}" fill="${SITE_COLOR[site]}" opacity="0.45"><title>${d.label} ${site}: ${v.toLocaleString()} req</title></rect>`);
      acc2 += v;
    }
    // x labels every ~4th + always today
    if (i === n - 1 || i % 4 === 0) svg.push(`<text x="${x(i)}" y="${P1T + P1H + 16}" font-size="10" fill="#9ca3af" text-anchor="middle">${d.label}${d.partial ? ' *' : ''}</text>`);
    if (i % 4 === 0) svg.push(`<text x="${x(i)}" y="${P2T + P2H + 16}" font-size="10" fill="#9ca3af" text-anchor="middle">${d.label}</text>`);
  });

  // GA4 lines (PMP only, whole range)
  const engPts = series.map((d, i) => (d.ga4Eng == null ? null : `${x(i)},${y1(d.ga4Eng)}`)).filter(Boolean).join(' ');
  const humPts = series.map((d, i) => (d.ga4Human == null ? null : `${x(i)},${y1(d.ga4Human)}`)).filter(Boolean).join(' ');
  if (humPts) svg.push(`<polyline points="${humPts}" fill="none" stroke="#60a5fa" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"><title>PMP GA4 human~</title></polyline>`);
  if (engPts) svg.push(`<polyline points="${engPts}" fill="none" stroke="#10b981" stroke-width="2.5"><title>PMP GA4 engaged</title></polyline>`);
  for (const [i, d] of series.entries()) if (d.ga4Eng != null) svg.push(`<circle cx="${x(i)}" cy="${y1(d.ga4Eng)}" r="2.5" fill="#10b981"><title>${d.label} PMP engaged: ${d.ga4Eng}</title></circle>`);

  // today marker
  svg.push(`<text x="${W - MR}" y="24" font-size="11" fill="#9ca3af" text-anchor="end">generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · *partial day</text>`);

  svg.push('</svg>');
  const legend = SITES.map((s) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px"><i style="width:12px;height:12px;border-radius:2px;background:${SITE_COLOR[s]};display:inline-block"></i>${s} humans~</span>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>humans~ — portfolio traffic</title>
<style>body{margin:24px;font-family:ui-sans-serif,system-ui,sans-serif;color:#111}svg{max-width:1080px;width:100%;height:auto}.l{display:flex;gap:4px;align-items:center;margin:8px 0 4px;font-size:12px;color:#374151}.dim{color:#9ca3af;font-size:11px;margin-top:10px;max-width:760px;line-height:1.5}.gl{width:34px;border-top:2.5px solid #10b981;display:inline-block;vertical-align:middle}.gd{width:34px;border-top:1.5px dashed #60a5fa;display:inline-block;vertical-align:middle}</style></head><body>
${svg.join('\n')}
<div class="l">${legend}<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px"><i class="gl"></i>PMP GA4 engaged (kotva)</span><span style="display:inline-flex;align-items:center;gap:5px"><i class="gd"></i>PMP GA4 human~</span></div>
<div class="dim">Stĺpce = unikátne ľudské IP adresy/deň po ASN+behavior filtri (horný odhad, residential-proxy farma ešte prechádza). Zelená = PMP GA4 engaged sessions — najbližšia pravde. Spodný panel = HTTP GET requesty/deň (prevaha botov). Zdroj: VPS nginx rotated logs + GA4 Data API + ip-api ASN.</div>
</body></html>`;
}

// ---------------- main ----------------
async function main() {
  try {
    FARM_RANGES = buildFarmRanges(await getFarmCidrs());
    console.log(`farm CIDR ranges loaded: ${FARM_RANGES.length}`);
  } catch { console.error('farm CIDR fetch failed — continuing without local ASN filter'); }
  if (!CHART) {
    const label = DAYS === 0 ? 'today' : DAYS === 1 ? 'yesterday' : `${DAYS} days ago`;
    console.log(`\n=========== HUMAN FILTER — ${label} ===========\n`);
    const sections = remoteAggregate([DAYS]);
    const candidates = SITES.flatMap((s) => (sections[s].get(DAYS) ?? []).filter(isCandidate).map((r) => r.ip));
    const info = SKIP_ENRICH ? {} : await enrich([...new Set(candidates)]);
    let total = 0;
    for (const s of SITES) total += reportSite(s, sections[s].get(DAYS) ?? [], info);
    let eng: number | null = null;
    try {
      const g = await ga4Tiers(DAYS);
      const key = Object.keys(g).sort()[0];
      eng = g[key]?.eng ?? null;
    } catch { /* no GA4 creds → n/a */ }
    console.log(`\nTOTAL humans~ ≈ ${total}   (PMP GA4 engaged cross-check: ${eng ?? 'n/a'})`);
    console.log('humans~ = unique human IPs/day. If it ≫ GA4 engaged, residential-proxy');
    console.log('farm is still leaking — treat as upper bound, engaged as anchor.\n');
    return;
  }

  // chart mode: sweep last N days (nginx retention ~8), GA4 for 28 days
  const nDays = Math.min(Math.max(DAYS, 1), 8);
  console.log(`Sweeping nginx logs for last ${nDays} days + GA4 28d…`);
  const dayIdxs = Array.from({ length: nDays }, (_, i) => nDays - 1 - i); // oldest→today
  const sections = remoteAggregate(dayIdxs);

  const allCandIps = new Set<string>();
  for (const s of SITES) for (const rows of sections[s].values()) for (const r of rows) if (isCandidate(r)) allCandIps.add(r.ip);
  console.log(`enriching ${allCandIps.size} candidate IPs…`);
  const info = SKIP_ENRICH ? {} : await enrich([...allCandIps]);

  let ga4: Record<string, { eng: number; human: number; raw: number }> = {};
  try { ga4 = await ga4Tiers(27); } catch { console.error('GA4 unavailable — chart without engaged line'); }

  // x-axis = last 28 calendar days (nginx fills only the tail)
  const series: DaySeries[] = [];
  for (let back = 27; back >= 0; back--) {
    const d = new Date(Date.now() - back * 86400_000);
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const label = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const humans = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<Site, number>;
    const requests = Object.fromEntries(SITES.map((s) => [s, 0])) as Record<Site, number>;
    if (back < nDays) {
      for (const s of SITES) {
        const rows = sections[s].get(back) ?? [];
        humans[s] = funnel(rows, info).humans.length;
        requests[s] = rows.reduce((a, r) => a + r.n, 0);
      }
    }
    series.push({ date: ymd, label, humans, requests, ga4Eng: ga4[ymd]?.eng ?? null, ga4Human: ga4[ymd]?.human ?? null, partial: back === 0 });
  }

  const html = buildChartHtml(series);
  const out = '/tmp/portfolio-humans.html';
  fs.writeFileSync(out, html);
  console.log(`chart → ${out}`);
  if (!NO_OPEN && process.platform === 'darwin') execSync(`open "${out}"`);

  // compact per-day summary for the swept window
  console.log(`\nday        ${SITES.map((s) => s.padStart(6)).join('')}   (PMP GA4 eng)`);
  for (const d of series.slice(-nDays)) {
    console.log(`${d.label}  ${SITES.map((s) => String(d.humans[s]).padStart(6)).join('')}   ${d.ga4Eng ?? '-'}`);
  }
  console.log('');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
