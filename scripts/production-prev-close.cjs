#!/usr/bin/env node

/**
 * Produkčné načítanie previous close
 * Rýchla verzia pre produkciu
 */

const { PrismaClient } = require('@prisma/client');

const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

async function fetchProductionPrevClose() {
  console.log('🚀 Produkčné Načítanie Previous Close');
  console.log('=====================================');
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Pripojené k produkčnej databáze');
    
    // Najprv skontroluj kľúčové tickery
    const testTickers = ['MSFT', 'AAPL', 'GOOGL', 'PLTR', 'ORCL'];
    console.log('\n📊 Kontrola kľúčových tickerov:');
    
    for (const symbol of testTickers) {
      const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { symbol: true, lastPrice: true, latestPrevClose: true }
      });
      
      if (ticker) {
        const ourChange = ticker.lastPrice && ticker.latestPrevClose 
          ? ((ticker.lastPrice - ticker.latestPrevClose) / ticker.latestPrevClose) * 100 
          : null;
        console.log(`   - ${ticker.symbol}: $${ticker.lastPrice} vs $${ticker.latestPrevClose} = ${ourChange?.toFixed(2)}%`);
        
        // Ak nemá prev close, načítaj ho
        if (!ticker.latestPrevClose) {
          try {
            const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`;
            const response = await fetch(aggUrl);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              const result = data.results[0];
              const prevClose = result.c;
              const prevDate = new Date(result.t);
              
              await prisma.ticker.update({
                where: { symbol },
                data: {
                  latestPrevClose: prevClose,
                  latestPrevCloseDate: prevDate
                }
              });
              
              const newChange = ticker.lastPrice && prevClose 
                ? ((ticker.lastPrice - prevClose) / prevClose) * 100 
                : null;
              console.log(`   ✅ ${symbol}: Aktualizované prev close $${prevClose} (${newChange?.toFixed(2)}%)`);
            }
          } catch (error) {
            console.error(`   ❌ ${symbol}: ${error.message}`);
          }
        }
      }
    }
    
    console.log('\n🎉 Produkčné prev close aktualizácia dokončená!');
    
  } catch (error) {
    console.error('❌ Produkčná chyba:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  fetchProductionPrevClose().catch(console.error);
}

module.exports = { fetchProductionPrevClose };
