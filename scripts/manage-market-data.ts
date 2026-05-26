/**
 * Production Market Data Management Script
 *
 * Usage (from /var/www/premarketprice):
 *   npx tsx scripts/manage-market-data.ts <command>
 *
 * Commands:
 *   full-reset  - Post-market reset (close→prevClose, clear movers, update shares, recompute analysis)
 *   reset       - Reset current prices to zero in Redis (forces fresh fetch on next request)
 *   fill        - Trigger closing price fill from Polygon (soft, won't overwrite existing)
 *   ingest      - Force ingest current prices for all tracked tickers
 *   status      - Show current data health status
 *   fix-ticker <TICKER> - Force sync details + analysis for a single ticker
 */

import { loadEnvFromFiles } from './_utils/loadEnv';
import { fetchWithRetry } from './_utils/fetchWithRetry';

loadEnvFromFiles();

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.BASE_URL || 'http://127.0.0.1:3000';
const CRON_SECRET = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET || '';

function authHeaders(): Record<string, string> {
    return {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
    };
}

async function callApi(path: string, method = 'POST'): Promise<any> {
    const url = `${API_BASE}${path}`;
    console.log(`📡 ${method} ${url}`);

    const res = await fetchWithRetry(url, { method, headers: authHeaders() });
    const text = await res.text();

    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }

    if (!res.ok) {
        console.error(`❌ ${res.status} ${res.statusText}`);
        console.error(JSON.stringify(data, null, 2));
        process.exit(1);
    }

    return data;
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function fullReset() {
    console.log('🔄 Full Post-Market Reset (close, movers, shares, analysis)...\n');
    const result = await callApi('/api/cron/post-market-reset');
    console.log('\n✅ Full reset complete:');
    console.log(JSON.stringify(result, null, 2));
}

async function resetPrices() {
    console.log('🗑️  Resetting current prices in Redis...\n');
    const result = await callApi('/api/prices/refresh');
    console.log('\n✅ Prices reset:');
    console.log(JSON.stringify(result, null, 2));
}

async function fillClosing() {
    console.log('📥 Filling closing prices from Polygon...\n');
    const result = await callApi('/api/cron/verify-prevclose');
    console.log('\n✅ Closing prices filled:');
    console.log(JSON.stringify(result, null, 2));
}

async function ingestCurrent() {
    console.log('📊 Ingesting current prices for all tickers...\n');
    const result = await callApi('/api/cron/refresh-all');
    console.log('\n✅ Ingest complete:');
    console.log(JSON.stringify(result, null, 2));
}

async function showStatus() {
    console.log('📋 Data Health Status...\n');
    const result = await callApi('/api/admin/data-health', 'GET');
    console.log(JSON.stringify(result, null, 2));
}

async function fixTicker(ticker: string) {
    if (!ticker) {
        console.error('❌ Usage: manage-market-data.ts fix-ticker <TICKER>');
        process.exit(1);
    }
    console.log(`🔧 Fixing ticker: ${ticker}\n`);

    // Trigger analysis sync (which also calls syncTickerDetails)
    const result = await callApi(`/api/analysis/${ticker}`, 'GET');
    console.log('\n✅ Ticker synced:');
    console.log(`   Name: ${result.companyName || 'N/A'}`);
    console.log(`   Sector: ${result.sector || 'N/A'}`);
    console.log(`   Industry: ${result.industry || 'N/A'}`);
    console.log(`   Price: $${result.currentPrice || 'N/A'}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const command = process.argv[2];
const arg = process.argv[3];

if (!CRON_SECRET) {
    console.warn('⚠️  CRON_SECRET_KEY not found in env. Auth may fail.\n');
}

console.log(`\n🏭 Market Data Manager`);
console.log(`   API: ${API_BASE}`);
console.log(`   Command: ${command || '(none)'}\n`);

switch (command) {
    case 'full-reset':
        fullReset().catch(err => { console.error('❌', err.message); process.exit(1); });
        break;
    case 'reset':
        resetPrices().catch(err => { console.error('❌', err.message); process.exit(1); });
        break;
    case 'fill':
        fillClosing().catch(err => { console.error('❌', err.message); process.exit(1); });
        break;
    case 'ingest':
        ingestCurrent().catch(err => { console.error('❌', err.message); process.exit(1); });
        break;
    case 'status':
        showStatus().catch(err => { console.error('❌', err.message); process.exit(1); });
        break;
    case 'fix-ticker':
        fixTicker(arg || '').catch(err => { console.error('❌', err.message); process.exit(1); });
        break;
    default:
        console.log(`Available commands:
  full-reset   Post-market reset (close→prevClose, movers, shares, analysis)
  reset        Reset current prices in Redis
  fill         Fill/verify closing prices from Polygon
  ingest       Force refresh all current prices
  status       Show data health
  fix-ticker   Force sync a single ticker (e.g. fix-ticker ONON)
`);
        process.exit(command ? 1 : 0);
}
