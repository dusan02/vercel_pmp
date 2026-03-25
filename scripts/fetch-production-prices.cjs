#!/usr/bin/env node

/**
 * Produkčný script na načítanie všetkých cien
 * Spustiť na produkčnom serveri
 */

const { PrismaClient } = require('@prisma/client');

const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

async function fetchProductionPrices() {
  console.log('🚀 Produkčné Načítanie Všetkých Cien');
  console.log('===================================');
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Pripojené k produkčnej databáze');
    
    // Získaj všetky tickery
    const allTickers = await prisma.ticker.findMany({
      select: { symbol: true }
    });
    
    console.log(`📋 Načítavam ceny pre ${allTickers.length} tickerov`);
    
    const batchSize = 50;
    let processed = 0;
    let errors = 0;
    
    for (let i = 0; i < allTickers.length; i += batchSize) {
      const batch = allTickers.slice(i, i + batchSize);
      const tickersParam = batch.map(t => t.symbol).join(',');
      
      try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${apiKey}`;
        
        console.log(`📥 Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allTickers.length/batchSize)} (${batch.length} tickers)...`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.tickers && Array.isArray(data.tickers)) {
          for (const tickerData of data.tickers) {
            const symbol = tickerData.ticker;
            const currentPrice = tickerData.last?.trade?.p || tickerData.min?.c;
            
            if (currentPrice && currentPrice > 0) {
              await prisma.ticker.update({
                where: { symbol },
                data: {
                  lastPrice: currentPrice,
                  updatedAt: new Date()
                }
              });
              
              processed++;
              
              // Zobraz kľúčové tickery
              if (['PLTR', 'ORCL', 'AAPL', 'MSFT', 'GOOGL'].includes(symbol)) {
                console.log(`   ✅ ${symbol}: $${currentPrice}`);
              }
            } else {
              errors++;
            }
          }
        }
        
        // Rate limiting
        if (i + batchSize < allTickers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`   ❌ Chyba v batch: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n🎉 Produkčné Načítanie Dokončené!`);
    console.log(`✅ Spracované: ${processed}/${allTickers.length} tickerov`);
    console.log(`❌ Chyby: ${errors}`);
    
    // Skontroluj kľúčové tickery
    const testTickers = ['PLTR', 'ORCL', 'AAPL', 'MSFT', 'GOOGL'];
    console.log(`\n📊 Produkčné Ceny po aktualizácii:`);
    
    for (const symbol of testTickers) {
      const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { symbol: true, lastPrice: true, updatedAt: true }
      });
      
      if (ticker) {
        console.log(`   - ${ticker.symbol}: $${ticker.lastPrice} (updated: ${ticker.updatedAt})`);
      }
    }
    
  } catch (error) {
    console.error('❌ Produkčná chyba:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  fetchProductionPrices().catch(console.error);
}

module.exports = { fetchProductionPrices };
