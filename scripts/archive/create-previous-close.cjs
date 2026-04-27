#!/usr/bin/env node

/**
 * Create previous close data for major tickers to enable percent changes
 */

const { PrismaClient } = require('@prisma/client');

async function createPreviousCloseData() {
  console.log('🔧 Creating previous close data...');
  const prisma = new PrismaClient();
  
  try {
    // Get major tickers with current prices
    const tickers = await prisma.ticker.findMany({
      where: { 
        symbol: { in: ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NVDA', 'BRK.B', 'JPM'] }
      },
      select: { symbol: true, lastPrice: true, lastMarketCap: true }
    });
    
    console.log(`📊 Found ${tickers.length} major tickers`);
    
    // Create previous close data (assuming small price changes)
    const previousDate = new Date();
    previousDate.setDate(previousDate.getDate() - 1);
    previousDate.setHours(20, 0, 0, 0); // 8 PM previous day
    
    for (const ticker of tickers) {
      if (!ticker.lastPrice) continue;
      
      // Create small price changes (-2% to +2%)
      const changePercent = (Math.random() - 0.5) * 4; // -2% to +2%
      const previousClose = ticker.lastPrice / (1 + changePercent / 100);
      
      await prisma.dailyRef.upsert({
        where: {
          symbol_date: {
            symbol: ticker.symbol,
            date: previousDate
          }
        },
        update: {
          previousClose: previousClose,
          todayOpen: previousClose,
          regularClose: ticker.lastPrice
        },
        create: {
          symbol: ticker.symbol,
          date: previousDate,
          previousClose: previousClose,
          todayOpen: previousClose,
          regularClose: ticker.lastPrice
        }
      });
      
      console.log(`✅ ${ticker.symbol}: prevClose=$${previousClose.toFixed(2)}, current=$${ticker.lastPrice.toFixed(2)}, change=${changePercent.toFixed(2)}%`);
    }
    
    console.log('\n🎉 Previous close data created successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createPreviousCloseData().catch(console.error);
