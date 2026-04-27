#!/usr/bin/env node

/**
 * Detailná analýza procesu výpočtu percentuálnych zmien
 * Skontroluje, ako sa vypočítavajú movement percentages
 */

const { PrismaClient } = require('@prisma/client');

async function analyzePriceCalculation() {
  console.log('🔍 Detailná Analýza Výpočtu Percentuálnych Zmien');
  console.log('================================================');
  
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('✅ Pripojené k databáze');
    
    // Skontroluj MSFT detailne
    const symbol = 'MSFT';
    console.log(`\n📊 Detailná analýza ${symbol}:`);
    
    // Získaj kompletné dáta
    const ticker = await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        symbol: true,
        name: true,
        lastPrice: true,
        latestPrevClose: true,
        latestPrevCloseDate: true,
        updatedAt: true,
        sharesOutstanding: true,
        lastMarketCap: true
      }
    });
    
    if (!ticker) {
      console.log(`❌ Ticker ${symbol} nenájdený`);
      return;
    }
    
    console.log(`   - Symbol: ${ticker.symbol}`);
    console.log(`   - Name: ${ticker.name}`);
    console.log(`   - Last Price: $${ticker.lastPrice}`);
    console.log(`   - Latest Prev Close: $${ticker.latestPrevClose}`);
    console.log(`   - Prev Close Date: ${ticker.latestPrevCloseDate}`);
    console.log(`   - Updated At: ${ticker.updatedAt}`);
    console.log(`   - Shares Outstanding: ${ticker.sharesOutstanding}`);
    console.log(`   - Last Market Cap: $${ticker.lastMarketCap}`);
    
    // Vypočítaj našu percentuálnu zmenu
    const ourChange = ticker.lastPrice && ticker.latestPrevClose 
      ? ((ticker.lastPrice - ticker.latestPrevClose) / ticker.latestPrevClose) * 100 
      : null;
    
    console.log(`\n🧮 Náš výpočet percentuálnej zmeny:`);
    console.log(`   - Current Price: $${ticker.lastPrice}`);
    console.log(`   - Previous Close: $${ticker.latestPrevClose}`);
    console.log(`   - Rozdiel: $${ticker.lastPrice - ticker.latestPrevClose}`);
    console.log(`   - Percentuálna zmena: ${ourChange?.toFixed(2)}%`);
    
    // Skontroluj session prices
    console.log(`\n📈 Session Prices pre ${symbol}:`);
    const sessionPrices = await prisma.sessionPrice.findMany({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
      take: 10
    });
    
    sessionPrices.forEach((price, i) => {
      console.log(`   ${i+1}. $${price.price} at ${price.timestamp} (session: ${price.session})`);
    });
    
    // Skontroluj daily references
    console.log(`\n📊 Daily References pre ${symbol}:`);
    const dailyRefs = await prisma.dailyRef.findMany({
      where: { symbol },
      orderBy: { date: 'desc' },
      take: 5
    });
    
    dailyRefs.forEach((ref, i) => {
      const change = ref.regularClose && ref.previousClose 
        ? ((ref.regularClose - ref.previousClose) / ref.previousClose) * 100 
        : null;
      console.log(`   ${i+1}. ${ref.date}: Close $${ref.regularClose}, Prev $${ref.previousClose} (${change?.toFixed(2)}%)`);
    });
    
    // Test Polygon API pre reálne dáta
    console.log(`\n🌐 Test Polygon API pre ${symbol}:`);
    try {
      const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
      const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbol}&apiKey=${apiKey}`;
      
      const response = await fetch(snapshotUrl);
      const data = await response.json();
      
      if (data.tickers && data.tickers.length > 0) {
        const tickerData = data.tickers[0];
        const currentPrice = tickerData.last?.trade?.p || tickerData.min?.c;
        const prevClose = tickerData.prevDay?.c;
        const dayChange = tickerData.min?.av ? ((tickerData.min.c - tickerData.min.av) / tickerData.min.av) * 100 : null;
        
        console.log(`   - Polygon Current: $${currentPrice}`);
        console.log(`   - Polygon Prev Close: $${prevClose}`);
        console.log(`   - Polygon Day Change: ${dayChange?.toFixed(2)}%`);
        console.log(`   - Polygon Last Trade: $${tickerData.last?.trade?.p} at ${new Date(tickerData.last?.trade?.t).toISOString()}`);
        console.log(`   - Polygon Min Data: $${tickerData.min?.c} (avg: $${tickerData.min?.av}) at ${new Date(tickerData.min?.t).toISOString()}`);
      }
      
      // Test aggregates pre prev close
      const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`;
      const aggResponse = await fetch(aggUrl);
      const aggData = await aggResponse.json();
      
      if (aggData.results && aggData.results.length > 0) {
        const result = aggData.results[0];
        console.log(`   - Aggregates Close: $${result.c} on ${new Date(result.t).toISOString().split('T')[0]}`);
        console.log(`   - Aggregates Open: $${result.o}`);
        console.log(`   - Aggregates High: $${result.h}`);
        console.log(`   - Aggregates Low: $${result.l}`);
        console.log(`   - Aggregates Volume: ${result.v}`);
      }
      
    } catch (error) {
      console.error(`   - Polygon API error: ${error.message}`);
    }
    
    // Skontroluj cache v Redis
    console.log(`\n🗄️  Redis Cache pre ${symbol}:`);
    try {
      const redis = require('redis');
      const redisClient = redis.createClient();
      await redisClient.connect();
      
      const priceKey = `price:${symbol}`;
      const priceData = await redisClient.get(priceKey);
      
      if (priceData) {
        const price = JSON.parse(priceData);
        console.log(`   - Redis Price: $${price.price}`);
        console.log(`   - Redis Timestamp: ${price.timestamp}`);
        console.log(`   - Redis Change: ${price.changePct?.toFixed(2)}%`);
      } else {
        console.log(`   - Redis: Žiadne dáta pre ${symbol}`);
      }
      
      await redisClient.disconnect();
    } catch (error) {
      console.log(`   - Redis error: ${error.message}`);
    }
    
    // Skontroluj výpočet v kóde
    console.log(`\n🔍 Analýza výpočtu v kóde:`);
    console.log('   - Hľadám funkcie pre výpočet percentuálnych zmien...');
    
    // Skontroluj frontend výpočet
    console.log('\n💻 Frontend výpočet:');
    console.log('   - Možno frontend používa iný výpočet');
    console.log('   - Možno sa používa iná base cena');
    console.log('   - Možno je problém s časovou zónou');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function analyzeMultipleTickers() {
  console.log('\n🎯 Analýza Viacerých Tickerov');
  console.log('============================');
  
  const tickers = ['MSFT', 'AAPL', 'GOOGL', 'PLTR', 'ORCL'];
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    
    for (const symbol of tickers) {
      const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: {
          symbol: true,
          lastPrice: true,
          latestPrevClose: true,
          latestPrevCloseDate: true
        }
      });
      
      if (ticker && ticker.lastPrice && ticker.latestPrevClose) {
        const ourChange = ((ticker.lastPrice - ticker.latestPrevClose) / ticker.latestPrevClose) * 100;
        console.log(`   ${symbol}: $${ticker.lastPrice} vs $${ticker.latestPrevClose} = ${ourChange.toFixed(2)}%`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await analyzePriceCalculation();
  await analyzeMultipleTickers();
  
  console.log('\n🎯 Zhrnutie Problému:');
  console.log('====================');
  console.log('1. Skontroluj, či latestPrevClose je správna');
  console.log('2. Over, či lastPrice je aktuálna');
  console.log('3. Skontroluj časovú zónu a dátum');
  console.log('4. Over výpočet percentuálnej zmeny');
  console.log('5. Skontroluj, či frontend používa rovnaký výpočet');
  
  console.log('\n🚀 Možné Riešenia:');
  console.log('===================');
  console.log('1. Aktualizovať latestPrevClose z Polygon aggregates');
  console.log('2. Overiť časovú zónu pre prev close');
  console.log('3. Skontrolovať výpočet v kóde');
  console.log('4. Spustiť refresh dát');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { analyzePriceCalculation, analyzeMultipleTickers };
