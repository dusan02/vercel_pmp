#!/usr/bin/env node

/**
 * Test Script - Overenie zdrojov cien
 * Skontroluje, odkiaľ prichádzajú ceny a prečo sú nesprávne
 */

const { PrismaClient } = require('@prisma/client');

async function analyzePrices() {
  console.log('🔍 Analýza Zdrojov Cien');
  console.log('========================');
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Pripojené k databáze');
    
    // Skontroluj PLTR a ORCL
    const tickers = ['PLTR', 'ORCL', 'AAPL', 'MSFT'];
    
    for (const ticker of tickers) {
      console.log(`\n📊 Analýza ${ticker}:`);
      
      const data = await prisma.ticker.findUnique({
        where: { symbol: ticker }
      });
      
      if (data) {
        console.log(`   - Name: ${data.name}`);
        console.log(`   - Sector: ${data.sector}`);
        console.log(`   - Industry: ${data.industry}`);
        console.log(`   - Last Price: $${data.lastPrice}`);
        console.log(`   - Last Market Cap: ${data.lastMarketCap}`);
        console.log(`   - Shares Outstanding: ${data.sharesOutstanding}`);
        console.log(`   - Latest Prev Close: $${data.latestPrevClose}`);
        console.log(`   - Latest Prev Close Date: ${data.latestPrevCloseDate}`);
        console.log(`   - Updated At: ${data.updatedAt}`);
        
        // Skontroluj session prices
        const sessionPrices = await prisma.sessionPrice.findMany({
          where: { symbol: ticker },
          orderBy: { timestamp: 'desc' },
          take: 5
        });
        
        console.log(`   - Session Prices (${sessionPrices.length}):`);
        sessionPrices.forEach((price, i) => {
          console.log(`     ${i+1}. $${price.price} at ${price.timestamp}`);
        });
        
        // Skontroluj daily refs
        const dailyRefs = await prisma.dailyRef.findMany({
          where: { symbol: ticker },
          orderBy: { date: 'desc' },
          take: 3
        });
        
        console.log(`   - Daily References (${dailyRefs.length}):`);
        dailyRefs.forEach((ref, i) => {
          console.log(`     ${i+1}. Close: $${ref.regularClose}, Prev: $${ref.previousClose} on ${ref.date}`);
        });
        
      } else {
        console.log(`   ❌ Ticker ${ticker} nenájdený v databáze`);
      }
    }
    
    // Skontroluj, kedy boli naposledy aktualizované dáta
    console.log('\n🕐 Časová Analýza Aktualizácií:');
    
    const recentUpdates = await prisma.ticker.findMany({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Posledných 24 hodín
        }
      },
      select: {
        symbol: true,
        updatedAt: true,
        lastPrice: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 10
    });
    
    console.log(`   - Posledných 10 aktualizácií (24h):`);
    recentUpdates.forEach((ticker, i) => {
      console.log(`     ${i+1}. ${ticker.symbol}: $${ticker.lastPrice} at ${ticker.updatedAt}`);
    });
    
    // Skontroluj Redis cache
    console.log('\n🗄️  Redis Cache Analýza:');
    try {
      const redis = require('redis');
      const redisClient = redis.createClient();
      await redisClient.connect();
      
      for (const ticker of ['PLTR', 'ORCL']) {
        const priceKey = `price:${ticker}`;
        const priceData = await redisClient.get(priceKey);
        
        if (priceData) {
          const price = JSON.parse(priceData);
          console.log(`   - Redis ${ticker}: $${price.price} at ${price.timestamp}`);
        } else {
          console.log(`   - Redis ${ticker}: ❌ Žiadne dáta`);
        }
      }
      
      await redisClient.disconnect();
    } catch (error) {
      console.log(`   - Redis error: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Test Polygon API
async function testPolygonAPI() {
  console.log('\n🌐 Test Polygon API');
  console.log('==================');
  
  const apiKey = process.env.POLYGON_API_KEY;
  
  if (!apiKey || apiKey === 'your_polygon_api_key_here') {
    console.log('❌ POLYGON_API_KEY nie je nastavený alebo je placeholder');
    return;
  }
  
  try {
    // Test current price
    const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=PLTR,ORCL&apiKey=${apiKey}`;
    console.log(`📥 Test snapshot: ${snapshotUrl}`);
    
    const response = await fetch(snapshotUrl);
    const data = await response.json();
    
    if (data.tickers && data.tickers.length > 0) {
      console.log('✅ Polygon API funguje:');
      data.tickers.forEach(ticker => {
        console.log(`   - ${ticker.ticker}: $${ticker.last?.trade?.p || ticker.min?.c || 'N/A'}`);
      });
    } else {
      console.log('❌ Polygon API vrátil prázdne dáta');
      console.log('Response:', data);
    }
    
    // Test previous close
    const prevCloseUrl = `https://api.polygon.io/v2/aggs/ticker/PLTR/prev?adjusted=true&apiKey=${apiKey}`;
    console.log(`\n📥 Test prev close: ${prevCloseUrl}`);
    
    const prevResponse = await fetch(prevCloseUrl);
    const prevData = await prevResponse.json();
    
    if (prevData.results && prevData.results.length > 0) {
      const result = prevData.results[0];
      console.log(`✅ PLTR prev close: $${result.c} on ${new Date(result.t).toISOString()}`);
    } else {
      console.log('❌ Prev close API zlyhal');
      console.log('Response:', prevData);
    }
    
  } catch (error) {
    console.error('❌ Polygon API error:', error.message);
  }
}

async function main() {
  await analyzePrices();
  await testPolygonAPI();
  
  console.log('\n🎯 Zhrnutie Problému:');
  console.log('===================');
  console.log('1. Skontroluj POLYGON_API_KEY v .env.local');
  console.log('2. Over, či API kľúč je platný a aktívny');
  console.log('3. Skontroluj, či worker beží a sťahuje dáta');
  console.log('4. Over časové zóny a čas aktualizácie');
  console.log('5. Skontroluj rate limiting a API limity');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { analyzePrices, testPolygonAPI };
