/**
 * Fetch ticker details + snapshot from Polygon and upsert into the Ticker table.
 * Usage: npx tsx scripts/seed-ticker-from-polygon.ts <SYMBOL>
 */

import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';

const symbol = (process.argv[2] || '').trim().toUpperCase();
if (!symbol) {
  console.error('Usage: npx tsx scripts/seed-ticker-from-polygon.ts <SYMBOL>');
  process.exit(1);
}

const API_KEY = process.env.POLYGON_API_KEY;
if (!API_KEY) {
  console.error('Missing POLYGON_API_KEY env var');
  process.exit(1);
}

async function polyFetch(url: string) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}apiKey=${API_KEY}`);
  if (!res.ok) throw new Error(`Polygon ${res.status}: ${res.statusText} – ${url}`);
  return res.json();
}

async function main() {
  console.log(`\n🔍 Fetching Polygon data for ${symbol}...`);

  // 1. Ticker details (name, market cap, shares, description, sic)
  const details = await polyFetch(`https://api.polygon.io/v3/reference/tickers/${symbol}`).catch(() => null);
  const d = details?.results;

  // 2. Snapshot (current price, change %)
  const snap = await polyFetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`).catch(() => null);
  const s = snap?.ticker;

  const lastPrice    = s?.day?.c || s?.prevDay?.c || 0;
  const prevClose    = s?.prevDay?.c || 0;
  const changePct    = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
  const sharesOut    = d?.share_class_shares_outstanding || d?.weighted_shares_outstanding || null;
  const marketCap    = d?.market_cap || (sharesOut && lastPrice ? sharesOut * lastPrice : 0);
  const marketCapDiff = prevClose > 0 && sharesOut ? (lastPrice - prevClose) * sharesOut : 0;
  const name         = d?.name || symbol;
  const description  = d?.description || null;
  const employees    = d?.total_employees || null;
  const headquarters = d?.address ? [d.address.city, d.address.state].filter(Boolean).join(', ') : null;
  const logoUrl      = d?.branding?.logo_url ? `${d.branding.logo_url}?apiKey=${API_KEY}` : null;
  const websiteUrl   = d?.homepage_url || null;

  // Derive sector/industry from SIC code description.
  // Only set values we're confident about; leave null otherwise so the
  // heatmap sectorIndustryOverrides (or Polygon's own metadata) can take precedence.
  const sicDesc: string = (d?.sic_description || '').toLowerCase();
  const sicCode: number = d?.sic || 0;
  let sector: string | null   = null;
  let industry: string | null = null;
  if (sicCode >= 2800 && sicCode <= 2899) { sector = 'Healthcare'; industry = 'Drug Manufacturers'; }
  else if (sicCode >= 3559 && sicCode <= 3679) { sector = 'Technology'; industry = 'Semiconductors'; }
  else if (sicCode >= 7370 && sicCode <= 7379) { sector = 'Technology'; industry = 'Software'; }
  else if (sicCode >= 4810 && sicCode <= 4899) { sector = 'Communication Services'; industry = 'Telecom Services'; }
  else if (sicCode >= 3720 && sicCode <= 3769) { sector = 'Industrials'; industry = 'Aerospace & Defense'; }
  else if (sicCode >= 6020 && sicCode <= 6099) { sector = 'Financial Services'; industry = 'Banks'; }
  else if (sicCode >= 6200 && sicCode <= 6299) { sector = 'Financial Services'; industry = 'Asset Management'; }
  else if (sicDesc.includes('software')) { sector = 'Technology'; industry = 'Software'; }
  else if (sicDesc.includes('semiconductor')) { sector = 'Technology'; industry = 'Semiconductors'; }
  else if (sicDesc.includes('aerospace') || sicDesc.includes('aircraft') || sicDesc.includes('guided missiles')) { sector = 'Industrials'; industry = 'Aerospace & Defense'; }
  else if (sicDesc.includes('pharmaceutical') || sicDesc.includes('drug')) { sector = 'Healthcare'; industry = 'Drug Manufacturers'; }
  else if (sicDesc.includes('petroleum') || sicDesc.includes('oil')) { sector = 'Energy'; industry = 'Oil & Gas Integrated'; }

  console.log(`   Name:        ${name}`);
  console.log(`   Price:       $${lastPrice}`);
  console.log(`   Prev close:  $${prevClose}`);
  console.log(`   Change:      ${changePct.toFixed(2)}%`);
  console.log(`   Market cap:  $${(marketCap / 1e9).toFixed(2)}B`);
  console.log(`   Shares out:  ${sharesOut ? (sharesOut / 1e6).toFixed(0) + 'M' : 'N/A'}`);
  console.log(`   Sector:      ${sector}`);

  await prisma.ticker.upsert({
    where: { symbol },
    update: {
      name,
      lastPrice,
      lastChangePct: changePct,
      lastMarketCap: marketCap,
      lastMarketCapDiff: marketCapDiff,
      latestPrevClose: prevClose || undefined,
      sector,
      industry,
      ...(sharesOut ? { sharesOutstanding: sharesOut } : {}),
      ...(description ? { description } : {}),
      ...(employees ? { employees } : {}),
      ...(headquarters ? { headquarters } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(websiteUrl ? { websiteUrl } : {}),
      updatedAt: new Date(),
    },
    create: {
      symbol,
      name,
      lastPrice,
      lastChangePct: changePct,
      lastMarketCap: marketCap,
      lastMarketCapDiff: marketCapDiff,
      latestPrevClose: prevClose || 0,
      lastVolume: s?.day?.v || 0,
      sector,
      industry,
      ...(sharesOut ? { sharesOutstanding: sharesOut } : {}),
      ...(description ? { description } : {}),
      ...(employees ? { employees } : {}),
      ...(headquarters ? { headquarters } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(websiteUrl ? { websiteUrl } : {}),
    },
  });

  console.log(`\n✅ ${symbol} upserted into Ticker table`);
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
