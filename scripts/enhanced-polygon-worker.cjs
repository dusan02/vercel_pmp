#!/usr/bin/env node

/**
 * INTEGRATED SPLIT HANDLING PRODUCTION WORKER
 * Integrácia split detekcie do existujúceho polygon workeru
 */

const { PrismaClient } = require('@prisma/client');
const { StockSplitDetector, SplitHandlingWorker } = require('./stock-split-detector.cjs');

// ===== ENHANCED POLYGON WORKER =====
class EnhancedPolygonWorker extends SplitHandlingWorker {
  constructor() {
    super();
    this.processedSplits = new Set(); // Cache pre spracované splity
  }

  /**
   * Enhanced ticker processing s split detection
   */
  async processTickerEnhanced(symbol, apiKey) {
    try {
      console.log(`🔄 Processing ${symbol} s split detection...`);

      // 1. Fetch current price (snapshot)
      const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbol}&apiKey=${apiKey}`;
      const snapshotResponse = await fetch(snapshotUrl);
      const snapshotData = await snapshotResponse.json();

      if (!snapshotData.tickers || snapshotData.tickers.length === 0) {
        console.log(`❌ ${symbol}: Žiadne snapshot dáta`);
        return { symbol, success: false, reason: 'No snapshot data' };
      }

      const ticker = snapshotData.tickers[0];
      const currentPrice = this.resolveEffectivePrice(ticker);
      const currentVolume = ticker.day?.v || 0;

      // 2. Fetch previous close (aggregates)
      const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`;
      const aggResponse = await fetch(aggUrl);
      const aggData = await aggResponse.json();

      let previousClose = null;
      let previousDate = null;

      if (aggData.results && aggData.results.length > 0) {
        previousClose = aggData.results[0].c;
        previousDate = new Date(aggData.results[0].t);
      }

      // 3. SPLIT DETECTION - KĽÚČOVÝ KROK!
      if (currentPrice && previousClose) {
        const splitResult = await this.processTickerWithSplitDetection(
          symbol, 
          currentPrice, 
          previousClose, 
          currentVolume
        );

        if (splitResult.splitDetected) {
          console.log(`🚨 SPLIT DETEKOVANÝ A SPRACOVANÝ PRE ${symbol}`);
          
          // Po splite musíme znova načítať previous close
          const newAggResponse = await fetch(aggUrl);
          const newAggData = await newAggResponse.json();
          
          if (newAggData.results && newAggData.results.length > 0) {
            previousClose = newAggData.results[0].c;
            previousDate = new Date(newAggData.results[0].t);
          }
        }
      }

      // 4. Vypočítaj metriky (s korigovanými hodnotami)
      const percentChange = this.calculatePercentChange(currentPrice, previousClose);
      const sharesOutstanding = await this.getSharesOutstanding(symbol);
      const marketCap = this.calculateMarketCap(currentPrice, sharesOutstanding);
      const marketCapDiff = this.calculateMarketCapDiff(currentPrice, previousClose, sharesOutstanding);

      // 5. Aktualizuj databázu
      await this.updateTickerData(symbol, {
        lastPrice: currentPrice,
        latestPrevClose: previousClose,
        latestPrevCloseDate: previousDate,
        lastMarketCap: marketCap,
        sharesOutstanding: sharesOutstanding,
        percentChange: percentChange,
        marketCapDiff: marketCapDiff
      });

      // 6. Aktualizuj Redis cache
      await this.updateRedisCache(symbol, {
        price: currentPrice,
        changePct: percentChange,
        marketCap: marketCap,
        marketCapDiff: marketCapDiff,
        timestamp: new Date()
      });

      console.log(`✅ ${symbol}: $${currentPrice} (${percentChange?.toFixed(2)}%) | MC: $${(marketCap / 1000000000).toFixed(1)}B`);

      return {
        symbol,
        success: true,
        currentPrice,
        previousClose,
        percentChange,
        marketCap,
        marketCapDiff,
        splitDetected: splitResult.splitDetected || false
      };

    } catch (error) {
      console.error(`❌ Error processing ${symbol}:`, error.message);
      return { symbol, success: false, error: error.message };
    }
  }

  /**
   * Efektívna cena s prioritou
   */
  resolveEffectivePrice(snapshot) {
    if (snapshot.lastTrade?.p) return snapshot.lastTrade.p;
    if (snapshot.min?.c) return snapshot.min.c;
    if (snapshot.day?.c) return snapshot.day.c;
    return null;
  }

  /**
   * Výpočet percentuálnej zmeny
   */
  calculatePercentChange(current, previous) {
    if (!current || !previous) return null;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Získanie počtu akcií
   */
  async getSharesOutstanding(symbol) {
    try {
      const ticker = await this.prisma.ticker.findUnique({
        where: { symbol },
        select: { sharesOutstanding: true }
      });
      return ticker?.sharesOutstanding || null;
    } catch (error) {
      console.error(`Error getting shares for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Výpočet market cap
   */
  calculateMarketCap(price, shares) {
    if (!price || !shares) return null;
    return price * shares;
  }

  /**
   * Výpočet market cap diff
   */
  calculateMarketCapDiff(currentPrice, prevPrice, shares) {
    const currentMarketCap = this.calculateMarketCap(currentPrice, shares);
    const prevMarketCap = this.calculateMarketCap(prevPrice, shares);
    if (!currentMarketCap || !prevMarketCap) return null;
    return currentMarketCap - prevMarketCap;
  }

  /**
   * Aktualizácia ticker dát
   */
  async updateTickerData(symbol, data) {
    await this.prisma.ticker.update({
      where: { symbol },
      data: {
        lastPrice: data.lastPrice,
        latestPrevClose: data.latestPrevClose,
        latestPrevCloseDate: data.latestPrevCloseDate,
        lastMarketCap: data.lastMarketCap,
        sharesOutstanding: data.sharesOutstanding,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Aktualizácia Redis cache
   */
  async updateRedisCache(symbol, data) {
    try {
      const redis = require('redis');
      const redisClient = redis.createClient();
      await redisClient.connect();

      await redisClient.set(`price:${symbol}`, JSON.stringify(data));
      await redisClient.disconnect();
    } catch (error) {
      console.error(`Error updating Redis for ${symbol}:`, error.message);
    }
  }

  /**
   * Enhanced batch processing s split detection
   */
  async processBatchEnhanced(tickers, apiKey) {
    console.log(`🚀 Processing batch of ${tickers.length} tickers s split detection...`);
    
    const results = [];
    let splitDetectedCount = 0;

    for (const symbol of tickers) {
      const result = await this.processTickerEnhanced(symbol, apiKey);
      results.push(result);
      
      if (result.splitDetected) {
        splitDetectedCount++;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`📊 Batch results: ${results.filter(r => r.success).length}/${results.length} successful`);
    console.log(`🚨 Splits detected: ${splitDetectedCount}`);

    return results;
  }
}

// ===== PRODUCTION READY SPLIT HANDLING =====
async function demonstrateProductionSplitHandling() {
  console.log('🏭 PRODUCTION SPLIT HANDLING DEMONSTRATION');
  console.log('==========================================');

  const worker = new EnhancedPolygonWorker();
  const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

  // Testovacie tickery (vrátane split scenárov)
  const testTickers = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'TSLA'];

  console.log('\n🔄 Processing tickers s enhanced split detection...');

  for (const symbol of testTickers) {
    console.log(`\n--- Processing ${symbol} ---`);
    const result = await worker.processTickerEnhanced(symbol, apiKey);
    
    if (result.success) {
      console.log(`✅ ${symbol}: $${result.currentPrice} (${result.percentChange?.toFixed(2)}%)`);
      console.log(`   Market Cap: $${(result.marketCap / 1000000000).toFixed(1)}B`);
      console.log(`   Market Cap Diff: $${(result.marketCapDiff / 1000000000).toFixed(1)}B`);
      console.log(`   Split Detected: ${result.splitDetected ? 'YES' : 'NO'}`);
    } else {
      console.log(`❌ ${symbol}: ${result.reason || result.error}`);
    }
  }

  console.log('\n🎯 Production split handling demonstration complete!');
}

// ===== MAIN =====
if (require.main === module) {
  demonstrateProductionSplitHandling().catch(console.error);
}

module.exports = { EnhancedPolygonWorker };
