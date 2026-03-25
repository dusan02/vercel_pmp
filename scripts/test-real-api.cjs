#!/usr/bin/env node

/**
 * Test Script s reálnym API kľúčom
 * Použi na testovanie po získaní skutočného POLYGON_API_KEY
 */

const { PrismaClient } = require('@prisma/client');

async function testWithRealAPI() {
  console.log('🔧 Test s Reálnym API Kľúčom');
  console.log('=============================');
  
  const apiKey = process.env.POLYGON_API_KEY;
  
  if (!apiKey || apiKey === 'your_polygon_api_key_here') {
    console.log('❌ Najprv nastav skutočný POLYGON_API_KEY:');
    console.log('   export POLYGON_API_KEY=tvoj_skutocny_kluc');
    console.log('   alebo ho pridaj do .env.local');
    return;
  }
  
  console.log('✅ API kľúč je nastavený');
  
  // Test Polygon API
  try {
    console.log('\n🌐 Test Polygon API pre PLTR a ORCL:');
    
    const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=PLTR,ORCL&apiKey=${apiKey}`;
    console.log(`📥 Request: ${snapshotUrl}`);
    
    const response = await fetch(snapshotUrl);
    const data = await response.json();
    
    if (data.tickers && data.tickers.length > 0) {
      console.log('✅ Polygon API funguje:');
      data.tickers.forEach(ticker => {
        const price = ticker.last?.trade?.p || ticker.min?.c || 'N/A';
        const change = ticker.min?.av ? ticker.min.c - ticker.min.av : 'N/A';
        console.log(`   - ${ticker.ticker}: $${price} (change: $${change})`);
      });
    } else {
      console.log('❌ Polygon API vrátil prázdne dáta');
      console.log('Response:', JSON.stringify(data, null, 2));
    }
    
    // Test prev close
    console.log('\n📈 Test Previous Close pre PLTR:');
    const prevCloseUrl = `https://api.polygon.io/v2/aggs/ticker/PLTR/prev?adjusted=true&apiKey=${apiKey}`;
    
    const prevResponse = await fetch(prevCloseUrl);
    const prevData = await prevResponse.json();
    
    if (prevData.results && prevData.results.length > 0) {
      const result = prevData.results[0];
      console.log(`✅ PLTR prev close: $${result.c} on ${new Date(result.t).toISOString().split('T')[0]}`);
      console.log(`   - Open: $${result.o}`);
      console.log(`   - High: $${result.h}`);
      console.log(`   - Low: $${result.l}`);
      console.log(`   - Volume: ${result.v}`);
    } else {
      console.log('❌ Prev close API zlyhal');
      console.log('Response:', JSON.stringify(prevData, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Polygon API error:', error.message);
  }
  
  // Test lokálnej databázy
  console.log('\n🗄️  Test Lokálnej Databázy:');
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    
    const tickers = await prisma.ticker.findMany({
      where: { symbol: { in: ['PLTR', 'ORCL'] } },
      select: { symbol: true, lastPrice: true, updatedAt: true }
    });
    
    console.log('Aktuálne dáta v lokálnej DB:');
    tickers.forEach(ticker => {
      console.log(`   - ${ticker.symbol}: $${ticker.lastPrice} (updated: ${ticker.updatedAt})`);
    });
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function simulatePriceUpdate() {
  console.log('\n🔄 Simulácia Aktualizácie Cien:');
  console.log('================================');
  
  const apiKey = process.env.POLYGON_API_KEY;
  
  if (!apiKey || apiKey === 'your_polygon_api_key_here') {
    console.log('❌ Potrebuješ skutočný API kľúč pre simuláciu');
    return;
  }
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    
    // Získaj aktuálne ceny z Polygon
    const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=PLTR,ORCL&apiKey=${apiKey}`;
    const response = await fetch(snapshotUrl);
    const data = await response.json();
    
    if (data.tickers && data.tickers.length > 0) {
      console.log('📥 Aktualizujem ceny v databáze:');
      
      for (const tickerData of data.tickers) {
        const symbol = tickerData.ticker;
        const currentPrice = tickerData.last?.trade?.p || tickerData.min?.c;
        
        if (currentPrice) {
          await prisma.ticker.update({
            where: { symbol },
            data: {
              lastPrice: currentPrice,
              updatedAt: new Date()
            }
          });
          
          console.log(`   ✅ ${symbol}: $${currentPrice}`);
        } else {
          console.log(`   ❌ ${symbol}: žiadna cena`);
        }
      }
      
      // Skontroluj výsledok
      const updatedTickers = await prisma.ticker.findMany({
        where: { symbol: { in: ['PLTR', 'ORCL'] } },
        select: { symbol: true, lastPrice: true, updatedAt: true }
      });
      
      console.log('\n📊 Aktualizované ceny:');
      updatedTickers.forEach(ticker => {
        console.log(`   - ${ticker.symbol}: $${ticker.lastPrice} (updated: ${ticker.updatedAt})`);
      });
      
    } else {
      console.log('❌ Nepodarilo sa získať dáta z Polygon API');
    }
    
  } catch (error) {
    console.error('❌ Simulácia error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await testWithRealAPI();
  await simulatePriceUpdate();
  
  console.log('\n🎯 Ďalšie Kroky:');
  console.log('=================');
  console.log('1. Získaj skutočný POLYGON_API_KEY z polygon.io');
  console.log('2. Nastav ho v .env.local');
  console.log('3. Spusti tento script znova');
  console.log('4. Ak funguje, spusti polygon worker:');
  console.log('   npm run worker:polygon');
  console.log('5. Skontroluj health status');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testWithRealAPI, simulatePriceUpdate };
