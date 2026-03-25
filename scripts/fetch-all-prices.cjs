#!/usr/bin/env node

/**
 * Jednoduchý script na načítanie všetkých cien
 * Použije skutočný Polygon API kľúč
 */

const { PrismaClient } = require('@prisma/client');

const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

async function fetchAllPrices() {
  console.log('🚀 Načítavam Všetky Ceny z Polygon API');
  console.log('=========================================');
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Pripojené k databáze');
    
    // Získaj všetky tickery
    const allTickers = await prisma.ticker.findMany({
      select: { symbol: true }
    });
    
    console.log(`📋 Načítavam ceny pre ${allTickers.length} tickerov`);
    
    const batchSize = 50; // Polygon limit
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
          // Aktualizuj ceny v databáze
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
              
              // Zobraz niekoľko príkladov
              if (processed <= 10 || processed % 100 === 0) {
                console.log(`   ✅ ${symbol}: $${currentPrice}`);
              }
            } else {
              console.log(`   ❌ ${symbol}: žiadna platná cena`);
              errors++;
            }
          }
        } else {
          console.log(`   ❌ Prázdna odpoveď pre batch`);
          errors++;
        }
        
        // Rate limiting - 1s delay
        if (i + batchSize < allTickers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`   ❌ Chyba v batch ${i}-${i+batchSize}: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n🎉 Načítanie Cien Dokončené!`);
    console.log(`✅ Spracované: ${processed}/${allTickers.length} tickerov`);
    console.log(`❌ Chyby: ${errors}`);
    console.log(`📊 Úspešnosť: ${((processed / allTickers.length) * 100).toFixed(1)}%`);
    
    // Skontroluj konkrétne prípady
    const testTickers = ['PLTR', 'ORCL', 'AAPL', 'MSFT', 'GOOGL'];
    console.log(`\n📊 Testovacie Tickery po aktualizácii:`);
    
    for (const symbol of testTickers) {
      const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { symbol: true, lastPrice: true, updatedAt: true }
      });
      
      if (ticker) {
        console.log(`   - ${ticker.symbol}: $${ticker.lastPrice} (updated: ${ticker.updatedAt})`);
      } else {
        console.log(`   - ${symbol}: ❌ nenájdený`);
      }
    }
    
  } catch (error) {
    console.error('❌ Hlavná chyba:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const startTime = Date.now();
  
  await fetchAllPrices();
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n⏱️  Celkový čas: ${duration.toFixed(1)} sekúnd`);
  
  console.log('\n🎯 Čo Ďalej:');
  console.log('=============');
  console.log('1. Skontroluj ceny v lokálnej databáze');
  console.log('2. Ak sú správne, skopíruj .env.local na produkciu');
  console.log('3. Spustiť worker na produkci');
  console.log('4. Skontrolovať health status');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fetchAllPrices };
