import { prisma } from '../src/lib/db/prisma';

async function fixMarketCapDisplay() {
  console.log('🔧 Fixing market cap display values...');
  
  try {
    // Find tickers with unrealistic market cap values (> 10000 billions)
    const problematicTickers = await prisma.ticker.findMany({
      where: {
        lastMarketCap: {
          gt: 10000 // Likely raw USD instead of billions
        }
      },
      select: {
        symbol: true,
        name: true,
        lastMarketCap: true,
        lastPrice: true,
        sharesOutstanding: true
      },
      take: 20
    });

    console.log(`Found ${problematicTickers.length} tickers with unrealistic market caps:`);

    for (const ticker of problematicTickers) {
      const currentMarketCap = ticker.lastMarketCap || 0;
      const computedMarketCap = (ticker.lastPrice || 0) * (ticker.sharesOutstanding || 0) / 1_000_000_000;
      
      console.log(`\n${ticker.symbol}:`);
      console.log(`  Current DB: ${currentMarketCap}B`);
      console.log(`  Computed: ${computedMarketCap.toFixed(2)}B`);
      console.log(`  Price: $${ticker.lastPrice || 0}`);
      console.log(`  Shares: ${(ticker.sharesOutstanding || 0).toLocaleString()}`);
      
      // Fix if computed value is more reasonable
      if (computedMarketCap > 0 && computedMarketCap < 10000) {
        await prisma.ticker.update({
          where: { symbol: ticker.symbol },
          data: { lastMarketCap: computedMarketCap }
        });
        console.log(`  ✅ FIXED: Updated to ${computedMarketCap.toFixed(2)}B`);
      } else {
        console.log(`  ⚠️  No fix applied - computed value also unrealistic`);
      }
    }

    console.log('\n✅ Market cap fix completed!');
    
  } catch (error) {
    console.error('❌ Error fixing market caps:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMarketCapDisplay();
