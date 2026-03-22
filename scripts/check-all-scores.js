#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAllScores() {
  try {
    console.log('🔍 Kontrolujem skóre pre všetky tickery...');
    
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'TSLA'];
    
    for (const symbol of tickers) {
      const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        include: {
          analysisCache: true
        }
      });
      
      if (ticker && ticker.analysisCache) {
        console.log(`\n📊 ${symbol}:`);
        console.log(`  Health Score: ${ticker.analysisCache.healthScore}`);
        console.log(`  Profitability Score: ${ticker.analysisCache.profitabilityScore}`);
        console.log(`  Valuation Score: ${ticker.analysisCache.valuationScore}`);
      } else {
        console.log(`\n❌ ${symbol}: Žiadne skóre`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllScores();
