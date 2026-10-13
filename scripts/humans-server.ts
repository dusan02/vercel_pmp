/**
 * Humans dashboard — local server showing MIN–MAX estimate of real human
 * visitors per site, per day.
 *
 *   npx tsx scripts/humans-server.ts [--port 7890] [--days 7]
 *   → open http://localhost:7890
 *
 * MIN = GA4 engagedSessions — most conservative anchor (real humans engage
 *       ~90%+; misses adblock/consent-blocked and pure bouncers → floor).
 * MAX = nginx humans~ — unique IPs that fetched HTML + JS with site referer,
 *       showed sane behavior (≥3 assets or ≥10 s dwell or ≥2 pages), had no
 *       crawler UA, and are not datacenter/proxy ASN (ip-api). Residential
 *       proxies + CGNAT still leak → ceiling.
 *
 * The truth is somewhere inside the band. PMP is known to sit near MIN
 * (rendering farm passes behavioral filters), Verifa near MAX.
 *
 * Data is computed on first request, then cached 10 min
 * (/api/data?refresh=1 forces recompute). SSH to VPS + GA4 Data API needed.
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS, PMP_SSH, *_GA4_PROPERTY_ID.
 */
import { createServer } from 'http';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getAccessToken } from './lib/googleAuth';

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const PORT = parseInt(arg('--port', '7890'), 10);
const DAYS = parseInt(arg('--days', '28'), 10);
const NGX_DAYS = Math.min(DAYS, 8); // nginx rotated-log retention ~8 days
const SSH = process.env.PMP_SSH ?? 'root@89.185.250.213';
const CACHE_FILE = path.join(os.homedir(), '.cache', 'pmp-ipinfo.json');
const CACHE_TTL = 30 * 86400_000;
const DATA_TTL = 10 * 60_000;

const SITES = [
  { key: 'PMP', log: 'access.log', dom: 'premarketprice', prop: process.env.GA4_PROPERTY_ID ?? '517675266' },
  { key: 'VERIFA', log: 'verifa_perf.log', dom: 'verifa', prop: process.env.VERIFA_GA4_PROPERTY_ID ?? '549637432' },
  { key: 'STOCKCV', log: 'stockcv.access.log', dom: 'stockcv', prop: process.env.STOCKCV_GA4_PROPERTY_ID ?? '558473004' },
  { key: 'ET', log: 'earnings-table.access.log', dom: 'earningstable', prop: process.env.ET_GA4_PROPERTY_ID ?? '503907803' },
  { key: 'GL', log: 'gainerslosers.access.log', dom: 'gainerslosers', prop: process.env.GL_GA4_PROPERTY_ID ?? '558867999' },
] as const;
type SiteKey = (typeof SITES)[number]['key'];

const SELF_IPS = new Set(['89.185.250.213', '95.102.193.78']);
const DC_ASN = /amazon|aws|google|microsoft|azure|hetzner|ovh|digitalocean|alibaba|tencent|oracle|vultr|linode|akamai|cloudflare|m247|datacamp|kamatera|scalaxy|worldhoster|leaseweb|contabo|servers?\.com|ionos|scaleway|upcloud|cogent|zayo|gtt|choopa|constant|hosting|datacenter|servermania|nucleus|kyivstar data|ip-?only networks/i;

type IpRow = { ip: string; n: number; pages: number; assets: number; jsref: number; span: number; bot: number };
type IpInfo = { cc?: string; as?: string; isp?: string; proxy?: boolean; hosting?: boolean; ts: number };

// ---------------- remote aggregation (one awk pass per log per day) ----------------
function remoteAggregate(): { sections: Record<SiteKey, Map<number, IpRow[]>>; srvDate: string } {
  const emits = SITES.map(
    (s) => `echo "===${s.key}|$d==="; emit ${s.log} ${s.dom} $d`,
  ).join('\n');
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
echo "===SRVDATE|$(date +%F)==="
for d in $(seq 0 ${NGX_DAYS - 1}); do
${emits}
done
`;
  const out = execSync(`ssh ${SSH} 'bash -s'`, { input: sh, encoding: 'utf8', timeout: 300000, maxBuffer: 512 * 1024 * 1024 });
  const res = Object.fromEntries(SITES.map((s) => [s.key, new Map<number, IpRow[]>()])) as Record<SiteKey, Map<number, IpRow[]>>;
  let cur: SiteKey | null = null, curDay = 0, srvDate = '';
  for (const line of out.split('\n')) {
    const sd = line.match(/^===SRVDATE\|(\d{4}-\d{2}-\d{2})===$/);
    if (sd) { srvDate = sd[1]; continue; }
    const m = line.match(/^===(\w+)\|(\d+)===$/);
    if (m) { cur = m[1] as SiteKey; curDay = +m[2]; res[cur].set(curDay, []); continue; }
    if (!cur || !line) continue;
    const [ip, n, pages, assets, jsref, span, bot] = line.split('\t');
    res[cur].get(curDay)!.push({ ip, n: +n, pages: +pages, assets: +assets, jsref: +jsref, span: +span, bot: +bot });
  }
  return { sections: res, srvDate };
}

// ---------------- ip-api enrichment (cached on disk) ----------------
function loadCache(): Record<string, IpInfo> {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}
async function enrich(ips: string[]): Promise<Record<string, IpInfo>> {
  const cache = loadCache();
  const now = Date.now();
  const missing = ips.filter((ip) => !cache[ip] || now - cache[ip].ts > CACHE_TTL);
  for (let i = 0; i < missing.length; i += 100) {
    const res = await fetch('http://ip-api.com/batch?fields=status,query,countryCode,as,isp,mobile,proxy,hosting', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(missing.slice(i, i + 100)),
    });
    if (!res.ok) break;
    for (const r of (await res.json()) as any[])
      if (r.status === 'success') cache[r.query] = { cc: r.countryCode, as: r.as, isp: r.isp, proxy: !!r.proxy, hosting: !!r.hosting, ts: now };
    if (i + 100 < missing.length) await new Promise((r) => setTimeout(r, 1400));
  }
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return cache;
}

const isCandidate = (r: IpRow) => r.jsref >= 1 && r.pages >= 1 && r.bot === 0 && !SELF_IPS.has(r.ip);
const behaviorOk = (r: IpRow) => r.assets >= 3 || r.span >= 10 || r.pages >= 2;
const isDc = (i?: IpInfo) => !!i && (i.hosting || i.proxy || DC_ASN.test(`${i.as} ${i.isp}`));

// ---------------- GA4 engaged (MIN) per site per day ----------------
async function ga4Engaged(prop: string): Promise<Record<string, number>> {
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${DAYS - 1}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'engagedSessions' }],
    }),
  });
  if (!res.ok) throw new Error(`GA4 ${prop}: ${res.status}`);
  const out: Record<string, number> = {};
  for (const r of (await res.json()).rows ?? [])
    out[String(r.dimensionValues[0].value)] = +r.metricValues[0].value;
  return out;
}

// ---------------- data assembly ----------------
type DayCell = { min: number; max: number | null; date: string; partial: boolean };
type SiteResult = { site: SiteKey; days: DayCell[] };
let cache: { at: number; data: SiteResult[] } | null = null;

async function compute(): Promise<SiteResult[]> {
  const { sections, srvDate } = remoteAggregate();
  // Labels follow the SERVER's calendar day (CEST) — that's what nginx logs
  // filter by. GA4 uses each property's own timezone, so boundary days can
  // be off by a few hours between MIN and MAX.
  const today0 = srvDate ? new Date(`${srvDate}T12:00:00Z`) : new Date();
  const candIps = new Set<string>();
  for (const s of SITES) for (const rows of sections[s.key].values()) for (const r of rows) if (isCandidate(r)) candIps.add(r.ip);
  const info = await enrich([...candIps]);

  const ga4: Record<SiteKey, Record<string, number>> = {} as any;
  await Promise.all(SITES.map(async (s) => {
    try { ga4[s.key] = await ga4Engaged(s.prop); } catch { ga4[s.key] = {}; }
  }));

  return SITES.map((s) => {
    const days: DayCell[] = [];
    for (let back = DAYS - 1; back >= 0; back--) {
      const d = new Date(today0.getTime() - back * 86400_000);
      const ymd = d.toISOString().slice(0, 10);
      const ga4key = ymd.replace(/-/g, '');
      const rows = sections[s.key].get(back) ?? [];
      const humans = back < NGX_DAYS
        ? rows.filter(isCandidate).filter(behaviorOk).filter((r) => !isDc(info[r.ip])).length
        : null;
      days.push({ date: ymd, min: ga4[s.key][ga4key] ?? 0, max: humans, partial: back === 0 });
    }
    return { site: s.key, days };
  });
}

// ---------------- HTML ----------------
const COLORS: Record<SiteKey, string> = { PMP: '#3b82f6', VERIFA: '#f59e0b', STOCKCV: '#8b5cf6', ET: '#9ca3af', GL: '#10b981' };
const fmtBand = (d: DayCell) => `${d.min}–${d.max === null ? '—' : d.max}`;

// Band chart: shaded area between MIN (bottom) and MAX (top) over days.
// MAX is null beyond nginx retention — those days draw only the MIN line.
function bandChart(days: { min: number; max: number | null }[], w: number, h: number, color: string, label: string): string {
  const ML = 34, MR = 6, PT = 18, PB = 18;
  const pw = w - ML - MR, ph = h - PT - PB;
  const n = days.length;
  const x = (i: number) => ML + (i / (n - 1)) * pw;
  const yMax = Math.max(4, ...days.map((d) => d.max ?? 0), ...days.map((d) => d.min));
  const y = (v: number) => PT + ph - (v / yMax) * ph;

  const minPts = days.map((d, i) => `${x(i).toFixed(1)},${y(d.min).toFixed(1)}`);
  // contiguous MAX segments (nulls break the line)
  const maxSegs: string[][] = [];
  let seg: string[] = [];
  days.forEach((d, i) => {
    if (d.max === null) { if (seg.length) maxSegs.push(seg), seg = []; }
    else seg.push(`${x(i).toFixed(1)},${y(d.max).toFixed(1)}`);
  });
  if (seg.length) maxSegs.push(seg);

  // band polygon = max line fwd + min line rev (only where max exists)
  let band = '';
  const idxs = days.map((d, i) => (d.max === null ? -1 : i)).filter((i) => i >= 0);
  if (idxs.length) {
    const top = idxs.map((i) => `${x(i).toFixed(1)},${y(days[i].max!).toFixed(1)}`);
    const bot = idxs.map((i) => `${x(i).toFixed(1)},${y(days[i].min).toFixed(1)}`).reverse();
    band = `<polygon points="${[...top, ...bot].join(' ')}" fill="${color}" opacity="0.15"/>`;
  }
  const lines = maxSegs.map((s2) => `<polyline points="${s2.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" opacity="0.85"/>`).join('');
  const minLine = `<polyline points="${minPts.join(' ')}" fill="none" stroke="#059669" stroke-width="1.5"/>`;
  const ticks = [0, 0.5, 1].map((f) => {
    const v = Math.round(yMax * f);
    return `<line x1="${ML}" x2="${w - MR}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${ML - 5}" y="${y(v) + 3}" font-size="9" fill="#9ca3af" text-anchor="end">${v}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif,system-ui,sans-serif">
<text x="${ML}" y="12" font-size="10.5" font-weight="600" fill="#374151">${label}</text>
${ticks}${band}${lines}${minLine}</svg>`;
}

function html(data: SiteResult[], at: number): string {
  const nDays = data[0]?.days.length ?? 0;
  const dates = data[0]?.days.map((d) => d.date.slice(5).split('-').reverse().join('.')) ?? [];

  // per-day TOTAL row across all 5 sites
  const totals: DayCell[] = dates.map((_, i) => ({
    date: data[0].days[i].date,
    min: data.reduce((s, r) => s + r.days[i].min, 0),
    max: data[0].days[i].max === null ? null : data.reduce((s, r) => s + (r.days[i].max ?? 0), 0),
    partial: data[0].days[i].partial,
  }));

  const cell = (s: SiteResult, d: DayCell) => {
    const scale = Math.max(1, ...s.days.map((x) => x.max ?? 0));
    const w = Math.min(100, d.max ? 8 + (d.max / scale) * 92 : 0);
    return `<td class="${d.partial ? 'partial' : ''}" title="${d.date} ${s.site}: min(GA4 engaged)=${d.min} max(nginx humans~)=${d.max ?? 'n/a (log rotated out)'}">
      <div class="band">${fmtBand(d)}</div><div class="bar"><i style="width:${w}%;background:${COLORS[s.site]}"></i></div></td>`;
  };
  const rows = data.map((s) => {
    const today = s.days[nDays - 1];
    const sumMin = s.days.reduce((a, d) => a + d.min, 0);
    const maxDays = s.days.filter((d) => d.max !== null);
    const sumMax = maxDays.reduce((a, d) => a + (d.max ?? 0), 0);
    return `<tr><th style="border-left:4px solid ${COLORS[s.site]}">${s.site}</th>${s.days.map((d) => cell(s, d)).join('')}
      <td class="sum">${sumMin}–${maxDays.length ? sumMax : '—'}</td><td class="today">${fmtBand(today)}</td></tr>`;
  }).join('');
  const totMin = totals.reduce((a, d) => a + d.min, 0);
  const totMax = totals.filter((d) => d.max !== null).reduce((a, d) => a + (d.max ?? 0), 0);
  const totalRow = `<tr class="total"><th>SPOLU</th>${totals.map((d) => `<td class="${d.partial ? 'partial' : ''}"><div class="band">${fmtBand(d)}</div></td>`).join('')}
    <td class="sum">${totMin}–${totMax}</td><td class="today">${fmtBand(totals[nDays - 1])}</td></tr>`;

  // monthly summary table: 5 site rows + total
  const sumRows = data.map((s) => {
    const sumMin = s.days.reduce((a, d) => a + d.min, 0);
    const maxDays = s.days.filter((d) => d.max !== null);
    const sumMax = maxDays.reduce((a, d) => a + (d.max ?? 0), 0);
    return `<tr><th style="border-left:4px solid ${COLORS[s.site]}">${s.site}</th>
      <td>${sumMin}</td><td>${(sumMin / nDays).toFixed(1)}</td><td>${maxDays.length ? sumMax : '—'}</td><td>${maxDays.length ? (sumMax / maxDays.length).toFixed(1) : '—'}</td></tr>`;
  }).join('');
  const totMinAvg = (totMin / nDays).toFixed(1);
  const totMaxAvg = (totMax / NGX_DAYS).toFixed(1);
  const sumTable = `<table class="sums">
<tr><th>web</th><th>MIN Σ (${nDays}d)</th><th>MIN ⌀/deň</th><th>MAX Σ (${NGX_DAYS}d)</th><th>MAX ⌀/deň</th></tr>
${sumRows}
<tr class="total"><th>SPOLU</th><td>${totMin}</td><td>${totMinAvg}</td><td>${totMax}</td><td>${totMaxAvg}</td></tr>
</table>`;

  // charts: big TOTAL band + per-site minis
  const charts = [
    bandChart(totals.map((d) => ({ min: d.min, max: d.max })), 920, 190, '#111827', `SPOLU všetky weby — MIN (zelená linka) až MAX (pásmo)`),
    `<div class="grid">${data.map((s) => `<div>${bandChart(s.days.map((d) => ({ min: d.min, max: d.max })), 440, 150, COLORS[s.site], `${s.site}`)}</div>`).join('')}</div>`,
  ].join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>humans min–max</title>
<meta http-equiv="refresh" content="600">
<style>
body{margin:28px;font-family:ui-sans-serif,system-ui,sans-serif;color:#111;max-width:960px}
h1{font-size:18px;margin:0 0 4px}
h2{font-size:14px;margin:22px 0 8px;color:#374151}
.sub{color:#6b7280;font-size:12px;margin-bottom:18px;line-height:1.5;max-width:760px}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:12.5px}
th,td{border:1px solid #e5e7eb;padding:5px 6px;text-align:center;white-space:nowrap}
th{background:#f9fafb;text-align:left;font-weight:600}
td.partial{background:#fefce8}
td.today{background:#f0fdf4;font-weight:700}
td.sum{background:#f8fafc;font-weight:700}
tr.total td,tr.total th{background:#eff6ff;font-weight:700}
.band{font-weight:600;font-variant-numeric:tabular-nums}
.bar{height:3px;background:#f3f4f6;margin-top:4px;border-radius:2px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:2px}
.sums{max-width:560px}
.sums td{font-variant-numeric:tabular-nums}
svg{width:100%;height:auto;display:block}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.foot{color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;max-width:860px}
a{color:#3b82f6}
</style></head><body>
<h1>Reálna ľudská návštevnosť — MIN–MAX odhad (${nDays} dní)</h1>
<div class="sub">
<b>MIN</b> = GA4 engagedSessions (konzervatívna podlaha — vyžaduje JS + engagement, premešká adblock).<br>
<b>MAX</b> = nginx humans~ — unikátne IP s reálnym renderom a normálnym správaním, mínus boti a datacenter/proxy ASN.
<b>Pozor:</b> nginx logy držia len ~${NGX_DAYS} dní → MAX existuje len pre posledné dni (staršie = „—").<br>
Žltý stĺpec = rozbehnutý dnešok. Modrá = súčty.
</div>
${charts}
<h2>Po dňoch</h2>
<div class="wrap"><table>
<tr><th>site</th>${dates.map((d, i) => `<th>${d}${i === dates.length - 1 ? ' *' : ''}</th>`).join('')}<th>Σ</th><th>dnes</th></tr>
${rows}${totalRow}
</table></div>
<h2>Mesačný súčet</h2>
${sumTable}
<div class="foot">
Vygenerované ${new Date(at).toLocaleTimeString('sk-SK')} · cache 10 min · <a href="/api/data">JSON</a> · <a href="/?refresh=1">refresh</a><br>
MIN podlieha GA4 consent/adblock strate; MAX podlieha CGNAT (viac ľudí = 1 IP) a residential-proxy farme (1 bot = 1 IP).
MAX Σ je súčet len za posledných ${NGX_DAYS} dní (staršie logy sú rotované preč). MIN Σ za ${nDays} dní.
Pravda je v pásme — pre PMP bližšie k MIN (renderujúca farma), pre Verifa bližšie k MAX.
</div>
</body></html>`;
}

// ---------------- server ----------------
let computing: Promise<SiteResult[]> | null = null;
async function getData(force: boolean): Promise<SiteResult[]> {
  if (!force && cache && Date.now() - cache.at < DATA_TTL) return cache.data;
  computing ??= compute().then((data) => { cache = { at: Date.now(), data }; computing = null; return data; })
    .catch((e) => { computing = null; throw e; });
  return computing;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const force = url.searchParams.get('refresh') === '1';
  try {
    const data = await getData(force);
    if (url.pathname === '/api/data') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ at: cache!.at, sites: data }, null, 1));
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html(data, cache!.at));
    }
  } catch (e: any) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(`compute error: ${e.message}`);
  }
}).listen(PORT, () => console.log(`humans dashboard → http://localhost:${PORT}  (first load computes ~30-60 s)`));
