import { prisma } from '../src/lib/db/prisma';

async function findMinMarketCap() {
  try {
    // Find ticker with smallest market cap (excluding null and 0)
    const minMarketCap = await prisma.ticker.findFirst({
      where: {
        lastMarketCap: {
          not: null,
          gt: 0
        }
      },
      orderBy: {
        lastMarketCap: 'asc'
      },
      select: {
        symbol: true,
        name: true,
        lastMarketCap: true,
        lastPrice: true,
        sector: true,
        industry: true
      }
    });

    if (minMarketCap) {
      console.log('\n📊 Ticker with smallest market cap:\n');
      console.log(`Symbol: ${minMarketCap.symbol}`);
      console.log(`Name: ${minMarketCap.name || 'N/A'}`);
      console.log(`Market Cap: $${(minMarketCap.lastMarketCap! / 1_000_000_000).toFixed(2)}B`);
      console.log(`Price: $${minMarketCap.lastPrice || 0}`);
      console.log(`Sector: ${minMarketCap.sector || 'N/A'}`);
      console.log(`Industry: ${minMarketCap.industry || 'N/A'}`);
    } else {
      console.log('No ticker found with market cap > 0');
    }

    // Also show bottom 10
    const bottom10 = await prisma.ticker.findMany({
      where: {
        lastMarketCap: {
          not: null,
          gt: 0
        }
      },
      orderBy: {
        lastMarketCap: 'asc'
      },
      take: 10,
      select: {
        symbol: true,
        name: true,
        lastMarketCap: true,
        lastPrice: true
      }
    });

    console.log('\n📊 Bottom 10 by market cap:\n');
    bottom10.forEach((ticker, index) => {
      const marketCapB = (ticker.lastMarketCap! / 1_000_000_000).toFixed(2);
      console.log(`${index + 1}. ${ticker.symbol} - ${ticker.name || 'N/A'} - $${marketCapB}B (Price: $${ticker.lastPrice || 0})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findMinMarketCap();

