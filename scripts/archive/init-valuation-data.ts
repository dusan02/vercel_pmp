#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { ValuationService } from '../src/services/valuationService.js';

const prisma = new PrismaClient();

async function initializeValuationData() {
  try {
    console.log('🚀 Initializing valuation data for all tickers...');
    
    // Získanie všetkých tickerov
    const tickers = await prisma.ticker.findMany({
      where: { 
        lastPrice: { not: null },
        symbol: { in: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'TSLA'] } // Pre testovanie
      },
      select: { symbol: true }
    });
    
    console.log(`📊 Found ${tickers.length} tickers to initialize`);
    
    for (const { symbol } of tickers) {
      try {
        console.log(`🔄 Processing ${symbol}...`);
        
        // Zber 10-ročných historických dát
        await ValuationService.collectHistoricalData(symbol, 10);
        
        // Výpočet percentilov
        await ValuationService.calculatePercentiles(symbol);
        
        console.log(`✅ ${symbol} completed`);
      } catch (error) {
        console.error(`❌ ${symbol} failed:`, error);
      }
    }
    
    console.log('🎉 Valuation data initialization completed!');
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Spustenie inicializácie
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeValuationData();
}
