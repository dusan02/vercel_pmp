/**
 * Analyze STALE status on localhost
 * Checks why stocks are marked as STALE
 */

import { prisma } from '../src/lib/db/prisma';
import { nowET } from '../src/lib/utils/dateET';
import { detectSession } from '../src/lib/utils/timeUtils';
import { getPricingState } from '../src/lib/utils/pricingStateMachine';

async function main() {
  console.log('=== ANALÝZA STALE PROBLÉMU NA LOCALHOSTE ===\n');
  
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
  
  const isFrozen = !!pricingState.useFrozenPrice;
  const thresholdMin = session === 'live' ? 1 : 5;
  
  stocks.forEach(s => {
    const ageMs = etNow.getTime() - s.lastPriceUpdated.getTime();
    const ageMinutes = Math.floor(ageMs / 60_000);
    const ageHours = Math.floor(ageMs / (60_000 * 60));
    
    const isStale = !isFrozen && s.lastPrice > 0 && ageMs > thresholdMin * 60_000;
    
    console.log(`${s.symbol}:`);
    console.log(`  Cena: $${s.lastPrice}`);
    console.log(`  Posledná aktualizácia: ${s.lastPriceUpdated.toISOString()}`);
    console.log(`  Vek dát: ${ageMinutes} min (${ageHours} hod)`);
    console.log(`  Is Frozen: ${isFrozen}`);
    console.log(`  Is Stale: ${isStale}`);
    if (isStale) {
      console.log(`  ⚠️  DÔVOD: ${isFrozen ? 'Frozen state nie je správne nastavený' : `Dáta sú staršie ako ${thresholdMin} min`}`);
    }
    console.log('');
  });
  
  console.log('\n=== ZÁVER ===');
  console.log(`Ak sú všetky hodnoty STALE, možné príčiny:`);
  console.log(`1. Worker nebeží - dáta sa neaktualizujú`);
  console.log(`2. Frozen state nie je správne nastavený (isFrozen=${isFrozen})`);
  console.log(`3. Dáta sú skutočne staré (viac ako ${thresholdMin} min)`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

