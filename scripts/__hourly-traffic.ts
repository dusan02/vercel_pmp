import { getAccessToken } from './lib/googleAuth';
const PROPERTY = process.env.GA4_PROPERTY_ID ?? '517675266';
const API = 'https://analyticsdata.googleapis.com/v1beta/properties';
const FARM_SOURCES = new Set(['(not set)', '(data not available)']);
const FARM_COUNTRIES = new Set(['Singapore', 'China', '(not set)']);

const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
const res = await fetch(`${API}/${PROPERTY}:runReport`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dateRanges: [{ startDate: '1daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'dateHour' }, { name: 'sessionSource' }, { name: 'country' }, { name: 'landingPage' }],
    metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }],
    limit: 250000,
  }),
});
if (!res.ok) { console.error(await res.text()); process.exit(1); }
const rows = (await res.json()).rows ?? [];

// dateHour format YYYYMMDDHH in property TZ
const byDayHour: Record<string, Record<number, { sess: number; eng: number; human: number }>> = {};
for (const r of rows) {
  const [dh, src, country, lp] = r.dimensionValues.map((d: any) => String(d.value));
  const sess = +r.metricValues[0].value, eng = +r.metricValues[1].value;
  const day = dh.slice(0, 8), hour = +dh.slice(8, 10);
  const cell = ((byDayHour[day] ??= {})[hour] ??= { sess: 0, eng: 0, human: 0 });
  cell.sess += sess; cell.eng += eng;
  if (lp !== '(not set)' && !FARM_SOURCES.has(src) && !FARM_COUNTRIES.has(country)) cell.human += sess;
}

const days = Object.keys(byDayHour).sort();
const today = days[days.length - 1], yday = days[days.length - 2];
// "now" = the latest hour that has any data today (property TZ)
const nowH = Math.max(...Object.keys(byDayHour[today]).map(Number));

const cum = (day: string, upToH: number) => {
  let sess = 0, eng = 0, human = 0;
  for (const [h, c] of Object.entries(byDayHour[day])) {
    if (+h <= upToH) { sess += c.sess; eng += c.eng; human += c.human; }
  }
  return { sess, eng, human };
};
const t = cum(today, nowH), y = cum(yday, nowH);
console.log(`GA4 property-TZ hour cutoff: ${String(nowH).padStart(2, '0')}:59`);
console.log(`today   ${today} 00–${nowH}h:  sessions ${t.sess}  human~ ${t.human}  engaged ${t.eng}`);
console.log(`yday    ${yday} 00–${nowH}h:  sessions ${y.sess}  human~ ${y.human}  engaged ${y.eng}`);

// per-hour table for context
console.log('\nhour   today(sess/hum/eng)   yday(sess/hum/eng)');
const hours = new Set([...Object.keys(byDayHour[today]), ...Object.keys(byDayHour[yday])].map(Number));
for (const h of [...hours].sort((a, b) => a - b)) {
  const a = byDayHour[today][h] ?? { sess: 0, eng: 0, human: 0 };
  const b = byDayHour[yday][h] ?? { sess: 0, eng: 0, human: 0 };
  if (h > nowH) continue;
  console.log(`${String(h).padStart(2, '0')}h    ${a.sess}/${a.human}/${a.eng}            ${b.sess}/${b.human}/${b.eng}`);
}
