/**
 * Check why stocks are marked as STALE
 */

import { prisma } from '../src/lib/db/prisma';
import { nowET, getDateET } from '../src/lib/utils/dateET';
import { detectSession } from '../src/lib/utils/timeUtils';
import { getPricingState } from '../src/lib/utils/pricingStateMachine';

async function main() {
  console.log('=== ANALÝZA STALE PROBLÉMU ===\n');
  
  const etNow = nowET();
  const session = detectSession(etNow);
  const pricingState = getPricingState(etNow);
  
  console.log(`Aktuálny čas (ET): ${etNow.toISOString()}`);
  console.log(`Session: ${session}`);
  console.log(`Pricing State: ${pricingState.state}`);
  console.log(`Is Frozen: ${pricingState.useFrozenPrice}`);
  console.log(`Can Ingest: ${pricingState.canIngest}`);
  console.log(`Threshold: ${session === 'live' ? '1 min' : '5 min'}\n`);
  
  const stocks = await prisma.ticker.findMany({
    where: {
      symbol: { in: ['NVDA', 'AAPL', 'GOOG', 'GOOGL', 'MSFT', 'AMZN', 'META', 'TSLA'] }
    },
    select: {
      symbol: true,
      lastPrice: true,
      lastPriceUpdated: true
    },
    orderBy: {
      lastMarketCap: 'desc'
    }
  });
  
  console.log('📊 Analýza cien:\n');
  
  stocks.forEach(s => {
    const ageMs = etNow.getTime() - s.lastPriceUpdated.getTime();
    const ageMin = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMin / 60);
    const ageDays = Math.floor(ageHours / 24);
    
    const thresholdMin = session === 'live' ? 1 : 5;
    const isFrozen = pricingState.useFrozenPrice;
    const isStale = !isFrozen && s.lastPrice > 0 && ageMs > thresholdMin * 60_000;
    
    console.log(`${s.symbol}:`);
    console.log(`  Cena: $${s.lastPrice.toFixed(2)}`);
    console.log(`  Posledná aktualizácia: ${s.lastPriceUpdated.toISOString()}`);
    console.log(`  Vek: ${ageDays}d ${ageHours % 24}h ${ageMin % 60}m (${Math.floor(ageMs / 1000)}s)`);
    console.log(`  Threshold: ${thresholdMin} min`);
    console.log(`  Is Frozen: ${isFrozen}`);
    console.log(`  Is Stale: ${isStale ? '✅ ÁNO' : '❌ NIE'}`);
    console.log('');
  });
  
  await prisma.$disconnect();
}

main().catch(console.error);

