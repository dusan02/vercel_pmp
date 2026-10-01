/**
 * One-off: today's traffic + click detail (farm-filtered where possible).
 * Usage: npx tsx scripts/__today-clicks.ts
 */
import { getAccessToken } from './lib/googleAuth';

const PROPERTY = process.env.GA4_PROPERTY_ID ?? '';
const API = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`;

async function rep(token: string, body: any) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error(`GA4 ${res.status}:`, await res.text()); process.exit(1); }
  return res.json();
}

const today = { startDate: 'today', endDate: 'today' };

async function main() {
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);

  // 1. Overall today + geo (farm check)
  const geo = await rep(token, {
    dateRanges: [today],
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagedSessions' }, { name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 15,
  });
  console.log('=== TODAY — sessions by country ===');
  for (const r of geo.rows ?? []) {
    console.log(`${r.dimensionValues[0].value.padEnd(22)} sess=${r.metricValues[0].value.padStart(4)} users=${r.metricValues[1].value.padStart(4)} engaged=${r.metricValues[2].value.padStart(4)} pv=${r.metricValues[3].value.padStart(4)}`);
  }

  // 2. Sources today
  const src = await rep(token, {
    dateRanges: [today],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 12,
  });
  console.log('\n=== TODAY — sources ===');
  for (const r of src.rows ?? []) {
    console.log(`${(r.dimensionValues[0].value + ' / ' + r.dimensionValues[1].value).padEnd(40)} sess=${r.metricValues[0].value}`);
  }

  // 3. Custom events today
  const ev = await rep(token, {
    dateRanges: [today],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 30,
  });
  console.log('\n=== TODAY — all events ===');
  for (const r of ev.rows ?? []) {
    console.log(`${r.dimensionValues[0].value.padEnd(26)} count=${r.metricValues[0].value.padStart(5)} users=${r.metricValues[1].value.padStart(4)}`);
  }

  // 4. ticker_click by click_source (registered custom dim)
  const clicks = await rep(token, {
    dateRanges: [today],
    dimensions: [{ name: 'customEvent:click_source' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'ticker_click' } } },
  });
  console.log('\n=== TODAY — ticker_click by click_source ===');
  for (const r of clicks.rows ?? []) {
    console.log(`${r.dimensionValues[0].value.padEnd(20)} clicks=${r.metricValues[0].value}`);
  }

  // 5. Which stock pages were actually visited (pagePath = which tickers)
  const stockPages = await rep(token, {
    dateRanges: [today],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/analysis/' } } },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 30,
  });
  console.log('\n=== TODAY — /analysis/* pageviews ===');
  for (const r of stockPages.rows ?? []) {
    console.log(`${r.dimensionValues[0].value.padEnd(28)} pv=${r.metricValues[0].value.padStart(4)} users=${r.metricValues[1].value.padStart(3)}`);
  }

  // 6. Top pages overall
  const top = await rep(token, {
    dateRanges: [today],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 20,
  });
  console.log('\n=== TODAY — top pages ===');
  for (const r of top.rows ?? []) {
    console.log(`${r.dimensionValues[0].value.padEnd(45)} pv=${r.metricValues[0].value.padStart(4)} users=${r.metricValues[1].value.padStart(3)}`);
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
