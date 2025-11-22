
const { stockDataCache } = require('./src/lib/cache/stockData');
const { prisma } = require('./src/lib/db/prisma');

async function test() {
  console.log('Testing StockDataCache...');
  
  try {
    const stocks = await stockDataCache.getAllStocks();
    console.log(`Fetched ${stocks.length} stocks from Redis.`);
    
    if (stocks.length > 0) {
      console.log('Sample stock:', stocks[0]);
    } else {
      console.warn('No stocks found. Ensure polygonWorker is running and populating Redis.');
    }
    
    const aapl = await stockDataCache.getStock('AAPL');
    console.log('AAPL data:', aapl);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
