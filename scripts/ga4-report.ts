/**
 * GA4 report via service account.
 *
 * Usage:
 *   npx tsx scripts/ga4-report.ts --property 123456789 [--days 28] [--dim country|newVsReturning|sessionSource|date|pagePath]
 *   npx tsx scripts/ga4-report.ts --mode funnel [--days 7]
 *     Prints the product funnel: entry pages → stock pages → alert
 *     subscribe → push return, plus all tracked custom events.
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

const API = 'https://analyticsdata.googleapis.com/v1beta/properties';

async function runReport(token: string, propertyId: string, body: any) {
  const res = await fetch(`${API}/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`GA4 API error ${res.status}:`, await res.text());
    process.exit(1);
  }
  return res.json();
}

/** Funnel mode: sessions bucketed by page type + custom event counts. */
async function funnel(propertyId: string, days: number) {
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
  const range = { startDate: `${days}daysAgo`, endDate: 'today' };

  // Stage 1-3: sessions by landing path
  const pages = await runReport(token, propertyId, {
    dateRanges: [range],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 1000,
  });

  const buckets: [string, RegExp][] = [
    ['Home (/)', /^\/$/],
    ['Movers/gainers/losers', /^\/(premarket-movers|gainers|losers|unusual-volume)/],
    ['Heatmap', /^\/heatmap/],
    ['Stock pages (analysis/valuation/premarket/financials)', /^\/(analysis|valuation|premarket|financials)\/.+/],
    ['Screener', /^\/screener/],
    ['Blog', /^\/blog/],
    ['Chinese locale', /^\/zh/],
  ];
  const counts = new Map<string, { s: number; e: number }>();
  let other = { s: 0, e: 0 };
  for (const r of pages.rows ?? []) {
    const path = r.dimensionValues?.[0]?.value ?? '';
    const s = parseInt(r.metricValues?.[0]?.value ?? '0', 10);
    const e = parseInt(r.metricValues?.[1]?.value ?? '0', 10);
    const hit = buckets.find(([, re]) => re.test(path));
    if (hit) {
      const c = counts.get(hit[0]) ?? { s: 0, e: 0 };
      c.s += s; c.e += e;
      counts.set(hit[0], c);
    } else {
      other.s += s; other.e += e;
    }
  }

  console.log(`\n=== GA4 funnel — last ${days} days ===\n`);
  console.log('PAGE STAGES'.padEnd(62) + 'sessions  engaged');
  console.log('-'.repeat(80));
  for (const [label] of buckets) {
    const c = counts.get(label);
    if (c) console.log(label.padEnd(62) + String(c.s).padStart(8) + String(c.e).padStart(8));
  }
  console.log('(other)'.padEnd(62) + String(other.s).padStart(8) + String(other.e).padStart(8));

  // Events
  const events = await runReport(token, propertyId, {
    dateRanges: [range],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: {
          values: ['view_item', 'subscribe_alert', 'unsubscribe_alert', 'push_return', 'heatmap_change', 'ticker_click', 'favorite_toggle'],
        },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
  });

  console.log('\nFUNNEL EVENTS'.padEnd(40) + 'count  users');
  console.log('-'.repeat(55));
  for (const r of events.rows ?? []) {
    console.log(
      (r.dimensionValues?.[0]?.value ?? '').padEnd(40) +
      String(r.metricValues?.[0]?.value ?? '0').padStart(6) +
      String(r.metricValues?.[1]?.value ?? '0').padStart(7)
    );
  }
  console.log('');
}

async function main() {
  const propertyId = arg('--property', process.env.GA4_PROPERTY_ID ?? '');
  if (!propertyId) {
    console.error('Missing --property <GA4_PROPERTY_ID> (GA4 → Admin → Property details → PROPERTY ID)');
    process.exit(1);
  }
  const days = parseInt(arg('--days', '28'), 10);
  if (arg('--mode', '') === 'funnel') {
    await funnel(propertyId, days);
    return;
  }
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
