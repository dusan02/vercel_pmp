/**
 * Full Audit Script - Audit all tickers and log status
 */

import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

// Load env
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.trim().split('=');
    if (key && valueParts.length > 0) {
      process.env[key] = valueParts.join('=');
    }
  });
}

const prisma = new PrismaClient();
const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

async function fetchStatus(symbol: string) {
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.status === 404) return '404';
    if (!resp.ok) return `Error ${resp.status}`;
    const data = await resp.json();
    return data.ticker ? 'OK' : 'No Data';
  } catch (err) {
    return 'Timeout/Error';
  }
}

async function main() {
  const tickers = await prisma.ticker.findMany({ select: { symbol: true } });
  console.log(`Auditing ${tickers.length} tickers...`);
  
  const results: Record<string, string> = {};
  const dead: string[] = [];

  for (let i = 0; i < tickers.length; i++) {
    const symbol = tickers[i].symbol;
    const status = await fetchStatus(symbol);
    results[symbol] = status;
    if (status === '404' || status === 'No Data') dead.push(symbol);
    
    if (i % 20 === 0) console.log(`Progress: ${i}/${tickers.length}...`);
    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync('audit_results.json', JSON.stringify({ total: tickers.length, deadCount: dead.length, dead, results }, null, 2));
  console.log(`Audit complete. Found ${dead.length} dead tickers. Results saved to audit_results.json`);
}

main().catch(console.error);
