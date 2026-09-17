/**
 * Google Search Console performance report via service account.
 *
 * Usage:
 *   npx tsx scripts/gsc-report.ts [--days 28] [--dim query|page|country|device|date]
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS — path to SA key (default ~/.config/pmp/gcp-service-account.json)
 *   GSC_SITE_URL — e.g. "sc-domain:premarketprice.com" or "https://premarketprice.com/"
 */
import { getAccessToken } from './lib/googleAuth';

const SITE_CANDIDATES = [
  process.env.GSC_SITE_URL,
  'sc-domain:premarketprice.com',
  'https://premarketprice.com/',
].filter(Boolean) as string[];

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function resolveSiteUrl(token: string): Promise<string> {
  for (const site of SITE_CANDIDATES) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      console.error(`Using site: ${site}`);
      return site;
    }
  }
  throw new Error(`SA has no access to any of: ${SITE_CANDIDATES.join(', ')} — add the service account email as a user in Search Console settings.`);
}

async function main() {
  const days = parseInt(arg('--days', '28'), 10);
  const dim = arg('--dim', 'query');
  const token = await getAccessToken(['https://www.googleapis.com/auth/webmasters.readonly']);
  const site = await resolveSiteUrl(token);

  const body = {
    startDate: isoDaysAgo(days),
    endDate: isoDaysAgo(2), // GSC data lags ~2 days
    dimensions: [dim],
    rowLimit: parseInt(arg('--limit', '50'), 10),
  };

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    console.error(`GSC API error ${res.status}:`, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const rows = data.rows ?? [];
  console.log(`\nGSC ${dim} report — last ${days} days (${body.startDate} → ${body.endDate})\n`);
  console.log(`${dim.padEnd(45)} clicks  impr.   CTR    pos`);
  console.log('-'.repeat(75));
  for (const r of rows) {
    const key = (r.keys?.[0] ?? '').slice(0, 44);
    const ctr = (r.ctr * 100).toFixed(1) + '%';
    console.log(
      `${key.padEnd(45)} ${String(Math.round(r.clicks)).padStart(6)} ${String(Math.round(r.impressions)).padStart(7)} ${ctr.padStart(6)} ${r.position.toFixed(1).padStart(6)}`
    );
  }
  if (rows.length === 0) console.log('(no rows)');
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
