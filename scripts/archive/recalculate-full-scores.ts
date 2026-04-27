#!/usr/bin/env node

import { AnalysisService } from '../src/services/analysisService';

async function recalculateFullScores() {
  try {
    console.log('🔄 Prepočítavam úplné skóre pre všetky tickery...');
    
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'TSLA'];
    
    for (const symbol of tickers) {
      try {
        console.log(`🔍 Spracujem ${symbol}...`);
        await AnalysisService.calculateScores(symbol);
        console.log(`✅ ${symbol} - Hotovo`);
      } catch (error) {
        console.log(`❌ ${symbol} - Error: ${(error as Error).message}`);
      }
    }
    
    console.log('\n🎉 Všetky skóre prepočítané!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

recalculateFullScores();
