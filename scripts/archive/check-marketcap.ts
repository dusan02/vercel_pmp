import { prisma } from '../src/lib/db/prisma';

async function checkMarketCap() {
  try {
    // Check stats
    const stats = await prisma.ticker.aggregate({
      _min: { lastMarketCap: true },
      _max: { lastMarketCap: true },
      _avg: { lastMarketCap: true },
      where: {
        lastMarketCap: { not: null }
      }
    });

    console.log('\n📊 Market Cap Statistics:\n');
    console.log(`Min: $${stats._min.lastMarketCap ? (stats._min.lastMarketCap / 1_000_000_000).toFixed(2) + 'B' : 'N/A'}`);
    console.log(`Max: $${stats._max.lastMarketCap ? (stats._max.lastMarketCap / 1_000_000_000).toFixed(2) + 'B' : 'N/A'}`);
    console.log(`Avg: $${stats._avg.lastMarketCap ? (stats._avg.lastMarketCap / 1_000_000_000).toFixed(2) + 'B' : 'N/A'}`);

    const withPrice = await prisma.ticker.count({
      where: { lastPrice: { gt: 0 } }
    });

    const withMarketCap = await prisma.ticker.count({
      where: { lastMarketCap: { gt: 0 } }
    });

    console.log(`\nTickers with price > 0: ${withPrice}`);
    console.log(`Tickers with market cap > 0: ${withMarketCap}`);

    // Find smallest market cap > 0
    const smallest = await prisma.ticker.findFirst({
      where: {
        lastMarketCap: {
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
        sharesOutstanding: true
      }
    });

    if (smallest) {
      console.log('\n📊 Ticker with smallest market cap (> 0):\n');
      console.log(`Symbol: ${smallest.symbol}`);
      console.log(`Name: ${smallest.name || 'N/A'}`);
      console.log(`Market Cap (raw): ${smallest.lastMarketCap}`);
      console.log(`Market Cap: $${(smallest.lastMarketCap! / 1_000_000_000).toFixed(2)}B`);
      console.log(`Price: $${smallest.lastPrice || 0}`);
      console.log(`Shares Outstanding: ${smallest.sharesOutstanding || 'N/A'}`);
      
      // Calculate market cap from price and shares
      if (smallest.lastPrice && smallest.sharesOutstanding) {
        const calculated = smallest.lastPrice * smallest.sharesOutstanding;
        console.log(`\nCalculated Market Cap: $${calculated.toLocaleString()}`);
        console.log(`Calculated Market Cap: $${(calculated / 1_000_000_000).toFixed(2)}B`);
      }
    } else {
      console.log('\n⚠️  No tickers found with market cap > 0');
      console.log('This means market cap is not being calculated or stored properly.');
    }

    // Show bottom 10 with actual values
    const bottom10 = await prisma.ticker.findMany({
      where: {
        lastMarketCap: {
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

    console.log('\n📊 Bottom 10 by market cap (actual values):\n');
    bottom10.forEach((ticker, index) => {
      const marketCapB = ticker.lastMarketCap! / 1_000_000_000;
      console.log(`${index + 1}. ${ticker.symbol} - ${ticker.name || 'N/A'} - $${marketCapB.toFixed(2)}B (Raw: ${ticker.lastMarketCap})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMarketCap();

