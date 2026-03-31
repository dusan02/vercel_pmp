import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadEnv();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function checkTicker(symbol: string) {
  const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
  try {
    const res = await fetch(url);
    if (res.status === 404) {
      console.log(`❌ ${symbol} DOES NOT EXIST (404)`);
      return;
    }
    const data = await res.json();
    if (data.results) {
        console.log(`${symbol} Active: ${data.results.active}, Name: ${data.results.name}`);
        if (!data.results.active && data.results.delisted_utc) {
            console.log(`   └─ Delisted on: ${data.results.delisted_utc}`);
        }
    } else {
        console.log(`? ${symbol} - Unknown response`, data);
    }
  } catch (err) {
    console.error(`Error checking ${symbol}:`, err);
  }
}

async function main() {
  const symbols = ['SRNE', 'ARNS', 'MNDT', 'SJI', 'JWN', 'GPS', 'ATVI', 'PEAK', 'WRK', 'ANSS', 'COHR', 'CIEN'];
  for (const s of symbols) {
    await checkTicker(s);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
  }
}

main().catch(console.error);
