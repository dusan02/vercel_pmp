
import { detectSession, isMarketOpen } from '@/lib/utils/timeUtils';

async function main() {
  const apiKey = process.env.POLYGON_API_KEY;
  const symbol = 'GOOGL';
  
  console.log(`Fetching snapshot for ${symbol}...`);
  
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbol}&apiKey=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);

