/**
 * GA4 report via service account.
 *
 * Usage:
 *   npx tsx scripts/ga4-report.ts --property 123456789 [--days 28] [--dim country|newVsReturning|sessionSource|date|pagePath]
 *
 * Env:
 *   GOOGLE_APPLICATION_CREDENTIALS — path to SA key (default ~/.config/pmp/gcp-service-account.json)
 *   GA4_PROPERTY_ID — numeric property id (GA4 → Admin → Property details)
 */
import { getAccessToken } from './lib/googleAuth';

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const propertyId = arg('--property', process.env.GA4_PROPERTY_ID ?? '');
  if (!propertyId) {
    console.error('Missing --property <GA4_PROPERTY_ID> (GA4 → Admin → Property details → PROPERTY ID)');
    process.exit(1);
  }
  const days = parseInt(arg('--days', '28'), 10);
  const dim = arg('--dim', 'country');
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);

  const body = {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: dim }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagedSessions' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 50,
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    console.error(`GA4 API error ${res.status}:`, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const rows = data.rows ?? [];
  console.log(`\nGA4 ${dim} report — last ${days} days\n`);
  console.log(`${dim.padEnd(40)} sessions  users  engaged  avgDur(s)`);
  console.log('-'.repeat(75));
  let totSessions = 0;
  for (const r of rows) {
    const key = (r.dimensionValues?.[0]?.value ?? '').slice(0, 39);
    const m = r.metricValues ?? [];
    const sessions = parseInt(m[0]?.value ?? '0', 10);
    totSessions += sessions;
    console.log(
      `${key.padEnd(40)} ${String(sessions).padStart(8)} ${String(m[1]?.value ?? '0').padStart(6)} ${String(m[2]?.value ?? '0').padStart(8)} ${Math.round(parseFloat(m[3]?.value ?? '0')).toString().padStart(9)}`
    );
  }
  console.log('-'.repeat(75));
  console.log(`${'TOTAL'.padEnd(40)} ${String(totSessions).padStart(8)}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
