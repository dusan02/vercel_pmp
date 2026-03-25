#!/usr/bin/env node

/**
 * Riešenie: Načítanie previous close hodnôt z Polygon API
 * a aktualizácia latestPrevClose v databáze
 */

const { PrismaClient } = require('@prisma/client');

const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

async function fetchPreviousClose() {
  console.log('🚀 Načítavam Previous Close z Polygon API');
  console.log('==========================================');
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Pripojené k databáze');
    
    // Získaj všetky tickery
    const allTickers = await prisma.ticker.findMany({
      select: { symbol: true, lastPrice: true }
    });
    
    console.log(`📋 Načítavam prev close pre ${allTickers.length} tickerov`);
    
    const batchSize = 20; // Polygon aggregates limit
    let processed = 0;
    let errors = 0;
    
    for (let i = 0; i < allTickers.length; i += batchSize) {
      const batch = allTickers.slice(i, i + batchSize);
      
      try {
        console.log(`📥 Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allTickers.length/batchSize)} (${batch.length} tickers)...`);
        
        // Pre každý ticker v batchi získaj prev close
        for (const ticker of batch) {
          try {
            const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker.symbol}/prev?adjusted=true&apiKey=${apiKey}`;
            
            const response = await fetch(aggUrl);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              const result = data.results[0];
              const prevClose = result.c;
              const prevDate = new Date(result.t);
              
              // Aktualizuj ticker s prev close
              await prisma.ticker.update({
                where: { symbol: ticker.symbol },
                data: {
                  latestPrevClose: prevClose,
                  latestPrevCloseDate: prevDate,
                  updatedAt: new Date()
                }
              });
              
              processed++;
              
              // Zobraz kľúčové príklady
              if (['MSFT', 'AAPL', 'GOOGL', 'PLTR', 'ORCL'].includes(ticker.symbol)) {
                const ourChange = ticker.lastPrice && prevClose 
                  ? ((ticker.lastPrice - prevClose) / prevClose) * 100 
                  : null;
                console.log(`   ✅ ${ticker.symbol}: Current $${ticker.lastPrice}, Prev $${prevClose} (${ourChange?.toFixed(2)}%)`);
              }
            } else {
              console.log(`   ❌ ${ticker.symbol}: Žiadne prev close dáta`);
              errors++;
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
            
          } catch (error) {
            console.error(`   ❌ ${ticker.symbol}: ${error.message}`);
            errors++;
          }
        }
        
      } catch (error) {
        console.error(`❌ Batch error: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n🎉 Previous Close Načítanie Dokončené!`);
    console.log(`✅ Spracované: ${processed}/${allTickers.length} tickerov`);
    console.log(`❌ Chyby: ${errors}`);
    console.log(`📊 Úspešnosť: ${((processed / allTickers.length) * 100).toFixed(1)}%`);
    
    // Skontroluj konkrétne prípady
    const testTickers = ['MSFT', 'AAPL', 'GOOGL', 'PLTR', 'ORCL'];
    console.log(`\n📊 Testovacie Tickery po aktualizácii:`);
    
    for (const symbol of testTickers) {
      const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { 
          symbol: true, 
          lastPrice: true, 
          latestPrevClose: true, 
          latestPrevCloseDate: true 
        }
      });
      
      if (ticker) {
        const ourChange = ticker.lastPrice && ticker.latestPrevClose 
          ? ((ticker.lastPrice - ticker.latestPrevClose) / ticker.latestPrevClose) * 100 
          : null;
        console.log(`   - ${ticker.symbol}: $${ticker.lastPrice} vs $${ticker.latestPrevClose} = ${ourChange?.toFixed(2)}%`);
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
  
  await fetchPreviousClose();
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n⏱️  Celkový čas: ${duration.toFixed(1)} sekúnd`);
  
  console.log('\n🎯 Čo Ďalej:');
  console.log('=============');
  console.log('1. Skontroluj percentuálne zmeny');
  console.log('2. Skopíruj na produkciu');
  console.log('3. Spusti refresh na produkci');
  console.log('4. Over health status');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fetchPreviousClose };
