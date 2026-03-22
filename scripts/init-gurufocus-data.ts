#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { GuruFocusService } from '../src/services/guruFocusService.js';

const prisma = new PrismaClient();

async function initializeGuruFocusData() {
  try {
    console.log('🚀 Initializing GuruFocus data for all tickers...');
    
    // Získanie všetkých tickerov s cenovými dátami
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
        
        // Aktualizácia GuruFocus metrík pre dnešok
        await GuruFocusService.updateGuruFocusMetrics(symbol, new Date());
        
        console.log(`✅ ${symbol} completed`);
      } catch (error) {
        console.error(`❌ ${symbol} failed:`, error);
      }
    }
    
    console.log('🎉 GuruFocus data initialization completed!');
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Spustenie inicializácie
initializeGuruFocusData();
