/**
 * Portfolio traffic — PMP + EarningsTable + Verifa in one command.
 *
 *   npm run traffic:all                → yesterday (default)
 *   npm run traffic:all -- --days 0    → today so far
 *   npm run traffic:all -- --days 5    → 5 days ago (nginx keeps ~8 rotated logs)
 *
 * GA4:
 *   PMP — full tiers (raw / rendered / human~ / engaged). Engaged is the most
 *   defensible "real humans" number (real users engage ~90%+; since ~2026-10-02
 *   the farm renders pages too, so rendered/human~ overcount).
 *   ET / Verifa — no property wired. Set ET_GA4_PROPERTY_ID /
 *   VERIFA_GA4_PROPERTY_ID to enable the same block for them (verifa GA4 has
 *   been dark since ~2026-09-23).
 *
 * Nginx (VPS rotated logs):
 *   "Browser IP" = IP that fetched an HTML page AND a .js asset carrying the
 *   site's referer — proves a real render (catches adblock users GA4 misses).
 *   Still an upper bound: the rendering farm passes it on PMP. Declared
 *   crawler UAs and our own IPs (VPS self, home) are excluded.
 *
 * Env: GOOGLE_APPLICATION_CREDENTIALS, GA4_PROPERTY_ID, PMP_SSH.
 */
import { getAccessToken } from './lib/googleAuth';
import { execSync } from 'child_process';

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const DAYS = parseInt(arg('--days', '1'), 10);
const SSH = process.env.PMP_SSH ?? 'root@89.185.250.213';
const API = 'https://analyticsdata.googleapis.com/v1beta/properties';
const PROPERTIES: [string, string | undefined][] = [
  ['PMP', process.env.GA4_PROPERTY_ID ?? '517675266'],
  ['ET', process.env.ET_GA4_PROPERTY_ID ?? '503907803'],
  ['VERIFA', process.env.VERIFA_GA4_PROPERTY_ID ?? '549637432'],
  ['STOCKCV', process.env.STOCKCV_GA4_PROPERTY_ID ?? '558473004'],
];

const FARM_SOURCES = new Set(['(not set)', '(data not available)']);
const FARM_COUNTRIES = new Set(['Singapore', 'China', '(not set)']);
const suspicious = (s: string, c: string) => FARM_SOURCES.has(s) || FARM_COUNTRIES.has(c);

type DayStat = { raw: number; rend: number; eng: number; human: number };

async function ga4Tiers(token: string, propertyId: string): Promise<Record<string, DayStat>> {
  const res = await fetch(`${API}/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
      dimensions: [
        { name: 'date' }, { name: 'landingPage' },
        { name: 'sessionSource' }, { name: 'country' },
      ],
      metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }],
      limit: 250000,
    }),
  });
  if (!res.ok) throw new Error(`GA4 ${propertyId}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const days: Record<string, DayStat> = {};
  for (const r of (await res.json()).rows ?? []) {
    const [date, lp, src, country] = (r.dimensionValues ?? []).map((d: any) => String(d.value));
    const sess = +r.metricValues[0].value;
    const eng = +r.metricValues[1].value;
    const d = (days[date] ??= { raw: 0, rend: 0, eng: 0, human: 0 });
    d.raw += sess;
    if (lp === '(not set)') continue;
    d.rend += sess; d.eng += eng;
    if (!suspicious(src, country)) d.human += sess;
  }
  return days;
}

// Realtime has no sessionSource/landingPage dims — country is the only
// farm signal available; flag suspicious-country share in parens.
async function ga4Realtime(token: string, propertyId: string): Promise<{ total: number; farm: number; top: string }> {
  const res = await fetch(`${API}/${propertyId}:runRealtimeReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metrics: [{ name: 'activeUsers' }],
      dimensions: [{ name: 'country' }],
      minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }],
      limit: 50,
    }),
  });
  if (!res.ok) throw new Error(`GA4rt ${propertyId}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  let total = 0, farm = 0;
  const byCountry: Record<string, number> = {};
  for (const r of (await res.json()).rows ?? []) {
    const c = String(r.dimensionValues?.[0]?.value ?? '?');
    const n = +r.metricValues[0].value;
    byCountry[c] = (byCountry[c] ?? 0) + n;
    total += n;
    if (FARM_COUNTRIES.has(c)) farm += n;
  }
  const top = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([c, n]) => `${c}:${n}`).join(' ');
  return { total, farm, top };
}

function printGa4(label: string, days: Record<string, DayStat>) {
  console.log(`  GA4 ${label}:   date        raw   rend   human~   eng`);
  for (const date of Object.keys(days).sort()) {
    const d = days[date];
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
    console.log(
      `                  ${iso} ${String(d.raw).padStart(6)} ${String(d.rend).padStart(6)} ${String(d.human).padStart(8)} ${String(d.eng).padStart(6)}`,
    );
  }
}

// Remote bash: picks the rotated log for --days N, greps the nginx date stamp
// inside (rotation isn't exactly midnight for ET), applies the browser-IP
// heuristic per site.
function nginxReport(): string {
  const sh = `
cd /var/log/nginx || exit 1
D=${DAYS}
DATE=$(date -d "$D days ago" +%d/%b/%Y)
echo "nginx log date: $DATE"
BOTUA='googlebot|bingbot|semrush|ahrefs|claudebot|gptbot|bytespider|petal|exabot|exasearch|meta-external|applebot|duckduckbot|yandex|baiduspider|mj12|dotbot|screaming|headless|slurp|sistrix|crawler|spider|bot/'
ASSETS='/api/|/_next|/static/|/logos|/icons|/assets|\\.js|\\.css|\\.png|\\.jpe?g|\\.svg|\\.ico|\\.woff|\\.ttf|\\.webp|\\.gif|\\.txt|\\.xml|\\.json|/sw\\.js|manifest|favicon|sitemap|robots|llms|/offline|\\.env|\\.php|wp-|/vendor/|/\\.git|\\.map'
SELF='^(89\\.185\\.250\\.213|95\\.102\\.)'

pick() {
  local base=$1
  if [ "$D" = "0" ]; then echo "$base"; return; fi
  if [ -f "$base.$D" ]; then echo "$base.$D"; else echo "$base.$D.gz"; fi
}

report() {
  local F=$(pick "$1") T=/tmp/pt_$2.log
  zcat -f "$F" 2>/dev/null | grep -F "[$DATE" > "$T"
  echo "----- $2 nginx ($(basename "$F")) -----"
  echo "  requests: $(wc -l < "$T" | tr -d ' ')   unique IPs: $(awk '{print $1}' "$T" | sort -u | wc -l | tr -d ' ')"
  grep '"GET ' "$T" | grep -vEi "$BOTUA" | grep -vE "$ASSETS" | awk '{print $1}' | grep -vE "$SELF" | sort -u > /tmp/pt_p.txt
  grep -E '"GET [^"]*\\.js' "$T" | grep -vEi "$BOTUA" | grep -E "$3" | awk '{print $1}' | grep -vE "$SELF" | sort -u > /tmp/pt_j.txt
  echo "  page IPs: $(wc -l < /tmp/pt_p.txt | tr -d ' ')   js+referer IPs: $(wc -l < /tmp/pt_j.txt | tr -d ' ')   BROWSER IPs: $(comm -12 /tmp/pt_p.txt /tmp/pt_j.txt | wc -l | tr -d ' ')"
  echo "  top IPs: $(awk '{print $1}' "$T" | sort | uniq -c | sort -rn | head -3 | awk '{printf "%sx%s ", $2, $1}')"
}

report access.log PMP premarketprice
report earnings-table.access.log ET earningstable
report verifa_perf.log VERIFA verifa
report stockcv.access.log STOCKCV stockcv
report gainerslosers.access.log GL gainerslosers

V=/tmp/pt_VERIFA.log
echo "----- VERIFA bots -----"
for b in ClaudeBot Bingbot Googlebot GPTBot ExaSearchBot PetalBot Bytespider meta-external; do
  echo "  $b: $(grep -ciE "$b" "$V")"
done
`;
  return execSync(`ssh ${SSH} 'bash -s'`, { input: sh, encoding: 'utf8', timeout: 60000 });
}

async function main() {
  const label = DAYS === 0 ? 'today' : DAYS === 1 ? 'yesterday' : `${DAYS} days ago`;
  console.log(`\n============ PORTFOLIO TRAFFIC — ${label} ============\n`);

  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
  for (const [label2, prop] of PROPERTIES) {
    if (!prop) {
      console.log(`  GA4 ${label2}:   (no property id — set ${label2}_GA4_PROPERTY_ID)`);
      continue;
    }
    try {
      printGa4(label2, await ga4Tiers(token, prop));
      const rt = await ga4Realtime(token, prop);
      console.log(`           RT(30m): ${String(rt.total).padStart(3)} active (${rt.farm} farm-country)   ${rt.top}`);
    } catch (e: any) {
      console.log(`  GA4 ${label2}:   ERROR ${e.message}`);
    }
  }

  console.log('');
  try {
    process.stdout.write(nginxReport());
  } catch (e: any) {
    console.log(`nginx: ERROR ${e.message}`);
  }

  console.log('\nReading: PMP real humans ≈ GA4 engaged (nginx browser IPs inflate via');
  console.log('rendering farm). Verifa browser IPs ≈ upper bound. ET 0 = scanner-only day.\n');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
