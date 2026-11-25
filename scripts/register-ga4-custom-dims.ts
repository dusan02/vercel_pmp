/**
 * Registers all missing event-scoped GA4 Custom Dimensions on PMP property.
 *
 * Prerequisite (one-time):
 *   Enable Google Analytics Admin API in GCP project 47392532694:
 *   https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=47392532694
 *   And ensure the Service Account has Editor role on GA4 property 517675266.
 *
 * Run:
 *   npx tsx scripts/register-ga4-custom-dims.ts [--property 517675266] [--dry-run]
 */
import { getAccessToken } from './lib/googleAuth';

const arg = (flag: string, def: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const DRY = process.argv.includes('--dry-run');
const PROPERTY = arg('--property', process.env.GA4_PROPERTY_ID ?? '517675266');
const BASE = `https://analyticsadmin.googleapis.com/v1beta/properties/${PROPERTY}/customDimensions`;

interface DimSpec {
  parameterName: string;
  displayName: string;
  description: string;
}

const DESIRED: DimSpec[] = [
  // human_signal (bot vs real-human passive input telemetry)
  { parameterName: 'hs_webdriver', displayName: 'HS Webdriver', description: 'navigator.webdriver flag (0/1) on human_signal' },
  { parameterName: 'hs_mouse', displayName: 'HS Mouse', description: 'Pointer/touch activity flag (0/1) on human_signal' },
  { parameterName: 'hs_scroll', displayName: 'HS Scroll', description: 'Scroll activity flag (0/1) on human_signal' },
  { parameterName: 'hs_input', displayName: 'HS Input', description: 'First input modality (mouse/touch/key/none) on human_signal' },
  { parameterName: 'hs_dwell', displayName: 'HS Dwell', description: 'Dwell seconds at flush on human_signal' },
  // chart & section_view events
  { parameterName: 'mode', displayName: 'Chart Mode', description: 'Chart view mode (price/valuation/etc.)' },
  { parameterName: 'metric', displayName: 'Chart Metric', description: 'Selected chart metric' },
  { parameterName: 'symbol', displayName: 'Symbol', description: 'Ticker symbol on chart/alert/interaction events' },
  { parameterName: 'state', displayName: 'Toggle State', description: 'On/off state for compare or indicator toggles' },
  { parameterName: 'ind', displayName: 'Chart Indicator', description: 'Technical indicator toggled on chart' },
  { parameterName: 'period', displayName: 'Chart Period', description: 'Selected chart timeframe (1D/1M/1Y/5Y)' },
  { parameterName: 'section', displayName: 'Section Viewed', description: 'Page section entered viewport (section_view)' },
  { parameterName: 'ticker', displayName: 'Ticker', description: 'Ticker symbol on section_view / analysis events' },
];

async function main() {
  const token = await getAccessToken(['https://www.googleapis.com/auth/analytics.edit']);

  const listRes = await fetch(`${BASE}?pageSize=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    const body = await listRes.text();
    console.error(`GA4 Admin API GET failed (${listRes.status}):\n${body}`);
    process.exit(1);
  }

  const existing = new Set<string>(
    ((await listRes.json()).customDimensions ?? []).map((d: any) => String(d.parameterName))
  );
  console.log(`Property ${PROPERTY}: ${existing.size} existing custom dimensions:`, [...existing].join(', ') || '(none)');

  let created = 0;
  let skipped = 0;
  for (const dim of DESIRED) {
    if (existing.has(dim.parameterName)) {
      console.log(`  skip  ${dim.parameterName} (already registered)`);
      skipped++;
      continue;
    }
    if (DRY) {
      console.log(`  [dry] create ${dim.parameterName} (${dim.displayName})`);
      continue;
    }
    const res = await fetch(BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parameterName: dim.parameterName,
        displayName: dim.displayName,
        description: dim.description,
        scope: 'EVENT',
      }),
    });
    if (!res.ok) {
      console.error(`  FAIL  ${dim.parameterName}: ${res.status} ${await res.text()}`);
      continue;
    }
    console.log(`  OK    ${dim.parameterName} (${dim.displayName})`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} already existed.`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
