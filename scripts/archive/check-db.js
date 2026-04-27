#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Kontrola databázy...');
    
    // Check tickers
    const tickerCount = await prisma.ticker.count();
    console.log(`📊 Tickers: ${tickerCount}`);
    
    if (tickerCount > 0) {
      const sampleTickers = await prisma.ticker.findMany({
        take: 5,
        select: { symbol: true, name: true, lastPrice: true, lastMarketCap: true }
      });
      console.log('📝 Sample tickers:', sampleTickers);
    }
    
    // Check financial statements
    const stmtCount = await prisma.financialStatement.count();
    console.log(`💰 Financial statements: ${stmtCount}`);
    
    // Check analysis cache
    const cacheCount = await prisma.analysisCache.count();
    console.log(`🗄️  Analysis cache: ${cacheCount}`);
    
    // Check users
    const userCount = await prisma.user.count();
    console.log(`👥 Users: ${userCount}`);
    
    // Check session prices
    const sessionCount = await prisma.sessionPrice.count();
    console.log(`📈 Session prices: ${sessionCount}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
