import { getAccessToken } from './lib/googleAuth';
const API = 'https://analyticsdata.googleapis.com/v1beta/properties';
const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
async function run(body: any) {
  const res = await fetch(`${API}/517675266:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error(await res.text()); process.exit(1); }
  return res.json();
}
// 1) click_source breakdown — od včera registrovaná dimenzia
const cs = await run({
  dateRanges: [{ startDate: '2daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'customEvent:click_source' }],
  metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
  dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'ticker_click' } } },
});
console.log('=== ticker_click × click_source (od registrácie dimenzie) ===');
for (const r of cs.rows ?? []) console.log(r.dimensionValues[0].value.padEnd(20), 'count:'+r.metricValues[0].value, 'users:'+r.metricValues[1].value);
// 2) funnel events dnes vs včera
const ev = await run({
  dateRanges: [{ startDate: 'yesterday', endDate: 'today' }],
  dimensions: [{ name: 'eventName' }, { name: 'date' }],
  metrics: [{ name: 'eventCount' }],
  dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['ticker_click','view_item','movers_view','page_view','session_start'] } } },
  orderBys: [{ dimension: { dimensionName: 'date' } }],
});
console.log('=== events yesterday+today ===');
for (const r of ev.rows ?? []) console.log(r.dimensionValues[1].value, r.dimensionValues[0].value.padEnd(16), r.metricValues[0].value);
