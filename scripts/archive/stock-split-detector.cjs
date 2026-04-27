#!/usr/bin/env node

/**
 * STOCK SPLIT DETECTION AND HANDLING
 * Kompletné riešenie pre detekciu a ošetrenie stock split anomálií
 */

const { PrismaClient } = require('@prisma/client');

// ===== SPLIT DETECTION CONSTANTS =====
const SPLIT_THRESHOLDS = {
  MIN_SPLIT_RATIO: 0.5,        // Minimálny pomer splitu (50% pokles)
  MAX_SPLIT_RATIO: 0.95,       // Maximálny pomer splitu (95% pokles)
  EXTREME_CHANGE_THRESHOLD: 50,  // Extrémna percentuálna zmena (%)
  MIN_VOLUME_THRESHOLD: 100000   // Minimálny volume pre validáciu
};

// ===== SPLIT DETECTION ALGORITHM =====
class StockSplitDetector {
  constructor(prisma) {
    this.prisma = prisma;
    this.splitCache = new Map(); // Cache pre detekované splity
  }

  /**
   * Detekuje potenciálny stock split
   * @param {string} symbol - ticker symbol
   * @param {number} currentPrice - aktuálna cena
   * @param {number} previousClose - predchádzajúca close cena
   * @param {number} volume - aktuálny volume
   * @returns {Object} - detekčný výsledok
   */
  async detectSplit(symbol, currentPrice, previousClose, volume = 0) {
    if (!currentPrice || !previousClose) {
      return { detected: false, reason: 'Missing price data' };
    }

    const percentChange = ((currentPrice - previousClose) / previousClose) * 100;
    const priceRatio = currentPrice / previousClose;
    
    console.log(`🔍 Split Detection pre ${symbol}:`);
    console.log(`   Current: $${currentPrice}`);
    console.log(`   Previous: $${previousClose}`);
    console.log(`   Change: ${percentChange.toFixed(2)}%`);
    console.log(`   Ratio: ${priceRatio.toFixed(4)}`);

    // 1. Extrémna percentuálna zmena
    if (Math.abs(percentChange) > SPLIT_THRESHOLDS.EXTREME_CHANGE_THRESHOLD) {
      return {
        detected: true,
        type: 'EXTREME_CHANGE',
        severity: 'HIGH',
        percentChange,
        priceRatio,
        reason: `Extrémna zmena: ${percentChange.toFixed(2)}%`
      };
    }

    // 2. Podozrivý pomer ceny (typické pre split)
    if (priceRatio <= SPLIT_THRESHOLDS.MIN_SPLIT_RATIO || 
        priceRatio >= SPLIT_THRESHOLDS.MAX_SPLIT_RATIO) {
      
      // Over volume splitu (splity majú typicky vysoký volume)
      const volumeValidation = await this.validateSplitVolume(symbol, volume);
      
      return {
        detected: true,
        type: 'SUSPICIOUS_RATIO',
        severity: volumeValidation.isValid ? 'MEDIUM' : 'HIGH',
        percentChange,
        priceRatio,
        volume: volumeValidation,
        reason: `Podozrivý pomer: ${priceRatio.toFixed(4)}, Volume: ${volumeValidation.message}`
      };
    }

    // 3. Kontrola bežných split pomerov
    const commonSplitRatios = [0.5, 0.333, 0.25, 0.2, 0.1, 0.125]; // 2:1, 3:1, 4:1, 5:1, 10:1, 8:1
    const isCommonSplit = commonSplitRatios.some(ratio => 
      Math.abs(priceRatio - ratio) < 0.05 // 5% tolerancia
    );

    if (isCommonSplit) {
      return {
        detected: true,
        type: 'COMMON_SPLIT_PATTERN',
        severity: 'HIGH',
        percentChange,
        priceRatio,
        reason: `Bežný split pomer: ${priceRatio.toFixed(4)}`
      };
    }

    return {
      detected: false,
      percentChange,
      priceRatio,
      reason: 'No split detected'
    };
  }

  /**
   * Validuje volume pre split detekciu
   */
  async validateSplitVolume(symbol, currentVolume) {
    try {
      // Získaj priemerný volume za posledných 30 dní
      const avgVolume = await this.getAverageVolume(symbol, 30);
      
      if (!avgVolume || currentVolume === 0) {
        return {
          isValid: false,
          message: 'Missing volume data',
          currentVolume,
          averageVolume: avgVolume
        };
      }

      const volumeRatio = currentVolume / avgVolume;
      
      // Splity majú typicky 2-10x vyšší volume
      const isValidSplitVolume = volumeRatio >= 2 && volumeRatio <= 20;
      
      return {
        isValid: isValidSplitVolume,
        message: `Volume ratio: ${volumeRatio.toFixed(2)}x (avg: ${(avgVolume/1000000).toFixed(1)}M)`,
        currentVolume,
        averageVolume: avgVolume,
        volumeRatio
      };

    } catch (error) {
      return {
        isValid: false,
        message: `Volume validation error: ${error.message}`,
        currentVolume
      };
    }
  }

  /**
   * Získaj priemerný volume
   */
  async getAverageVolume(symbol, days) {
    try {
      // Použi Polygon aggregates pre volume data
      const apiKey = process.env.POLYGON_API_KEY;
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);

      const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&apiKey=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const totalVolume = data.results.reduce((sum, day) => sum + day.v, 0);
        return totalVolume / data.results.length;
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting average volume for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Potvrdí split pomocou externých zdrojov
   */
  async confirmSplit(symbol, detectionResult) {
    try {
      // 1. Skontroluj Polygon splits API (ak existuje)
      const polygonConfirmation = await this.checkPolygonSplits(symbol);
      
      // 2. Skontroluj Yahoo Finance (fallback)
      const yahooConfirmation = await this.checkYahooFinance(symbol);
      
      // 3. Skontroluj SEC filings (ultimate fallback)
      const secConfirmation = await this.checkSECFilings(symbol);

      const confirmation = {
        polygon: polygonConfirmation,
        yahoo: yahooConfirmation,
        sec: secConfirmation,
        overall: polygonConfirmation.confirmed || yahooConfirmation.confirmed || secConfirmation.confirmed
      };

      return {
        ...detectionResult,
        confirmed: confirmation.overall,
        confirmation,
        timestamp: new Date()
      };

    } catch (error) {
      console.error(`Error confirming split for ${symbol}:`, error.message);
      return {
        ...detectionResult,
        confirmed: false,
        confirmationError: error.message
      };
    }
  }

  /**
   * Kontrola Polygon splits API
   */
  async checkPolygonSplits(symbol) {
    try {
      const apiKey = process.env.POLYGON_API_KEY;
      const url = `https://api.polygon.io/v3/reference/splits/${symbol}?apiKey=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const latestSplit = data.results[0];
        return {
          confirmed: true,
          source: 'polygon',
          splitDate: latestSplit.executionDate,
          splitRatio: latestSplit.splitTo / latestSplit.splitFrom,
          details: latestSplit
        };
      }
      
      return { confirmed: false, source: 'polygon' };
    } catch (error) {
      return { confirmed: false, source: 'polygon', error: error.message };
    }
  }

  /**
   * Kontrola Yahoo Finance (fallback)
   */
  async checkYahooFinance(symbol) {
    try {
      // Yahoo Finance API call pre split history
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?events=split`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.chart?.result?.[0]?.events?.splits) {
        const splits = Object.values(data.chart.result[0].events.splits);
        const latestSplit = splits[splits.length - 1];
        
        return {
          confirmed: true,
          source: 'yahoo',
          splitDate: new Date(latestSplit.date * 1000),
          splitRatio: latestSplit.numerator / latestSplit.denominator,
          details: latestSplit
        };
      }
      
      return { confirmed: false, source: 'yahoo' };
    } catch (error) {
      return { confirmed: false, source: 'yahoo', error: error.message };
    }
  }

  /**
   * Kontrola SEC filings (ultimate fallback)
   */
  async checkSECFilings(symbol) {
    // TODO: Implement SEC API integration
    return { confirmed: false, source: 'sec', message: 'Not implemented' };
  }

  /**
   * Aplikuje split korekciu na historické dáta
   */
  async applySplitCorrection(symbol, splitData) {
    try {
      console.log(`🔧 Aplikujem split korekciu pre ${symbol}:`);
      console.log(`   Split Ratio: ${splitData.splitRatio}`);
      console.log(`   Split Date: ${splitData.splitDate}`);

      // 1. Aktualizuj všetky historické ceny
      await this.updateHistoricalPrices(symbol, splitData.splitRatio, splitData.splitDate);
      
      // 2. Aktualizuj previous close
      await this.updatePreviousClose(symbol, splitData.splitRatio);
      
      // 3. Aktualizuj shares outstanding
      await this.updateSharesOutstanding(symbol, splitData.splitRatio);
      
      // 4. Zaloguj split udalosť
      await this.logSplitEvent(symbol, splitData);

      return {
        success: true,
        symbol,
        splitRatio: splitData.splitRatio,
        splitDate: splitData.splitDate,
        timestamp: new Date()
      };

    } catch (error) {
      console.error(`Error applying split correction for ${symbol}:`, error.message);
      return {
        success: false,
        symbol,
        error: error.message
      };
    }
  }

  /**
   * Aktualizuje historické ceny
   */
  async updateHistoricalPrices(symbol, splitRatio, splitDate) {
    const splitDateObj = new Date(splitDate);
    
    // Aktualizuj daily refs
    await this.prisma.dailyRef.updateMany({
      where: {
        symbol,
        date: { lt: splitDateObj }
      },
      data: {
        regularClose: { multiply: splitRatio },
        previousClose: { multiply: splitRatio },
        open: { multiply: splitRatio },
        high: { multiply: splitRatio },
        low: { multiply: splitRatio }
      }
    });

    // Aktualizuj session prices
    await this.prisma.sessionPrice.updateMany({
      where: {
        symbol,
        timestamp: { lt: splitDateObj }
      },
      data: {
        lastPrice: { multiply: splitRatio }
      }
    });
  }

  /**
   * Aktualizuj previous close
   */
  async updatePreviousClose(symbol, splitRatio) {
    await this.prisma.ticker.update({
      where: { symbol },
      data: {
        latestPrevClose: { multiply: splitRatio }
      }
    });
  }

  /**
   * Aktualizuj shares outstanding
   */
  async updateSharesOutstanding(symbol, splitRatio) {
    await this.prisma.ticker.update({
      where: { symbol },
      data: {
        sharesOutstanding: { divide: splitRatio }
      }
    });
  }

  /**
   * Zaloguj split udalosť
   */
  async logSplitEvent(symbol, splitData) {
    // TODO: Implement split event logging
    console.log(`📝 Split event logged for ${symbol}`);
  }
}

// ===== SPLIT HANDLING WORKER =====
class SplitHandlingWorker {
  constructor() {
    this.prisma = new PrismaClient();
    this.detector = new StockSplitDetector(this.prisma);
  }

  async processTickerWithSplitDetection(symbol, currentPrice, previousClose, volume) {
    try {
      // 1. Detekuj split
      const detection = await this.detector.detectSplit(symbol, currentPrice, previousClose, volume);
      
      if (!detection.detected) {
        return { symbol, splitDetected: false, reason: detection.reason };
      }

      console.log(`🚨 POTENCIÁLNY SPLIT DETEKOVANÝ PRE ${symbol}:`);
      console.log(`   Typ: ${detection.type}`);
      console.log   (`   Severity: ${detection.severity}`);
      console.log(`   Zmena: ${detection.percentChange.toFixed(2)}%`);
      console.log(`   Pomer: ${detection.priceRatio.toFixed(4)}`);
      console.log(`   Dôvod: ${detection.reason}`);

      // 2. Potvrď split
      const confirmation = await this.detector.confirmSplit(symbol, detection);
      
      if (!confirmation.confirmed) {
        console.log(`❌ Split pre ${symbol} NEBOL potvrdený`);
        return { 
          symbol, 
          splitDetected: false, 
          reason: 'Split not confirmed',
          detection,
          confirmation 
        };
      }

      console.log(`✅ SPLIT POTVRDENÝ PRE ${symbol}!`);
      console.log(`   Split Ratio: ${confirmation.confirmation.polygon?.splitRatio || confirmation.confirmation.yahoo?.splitRatio}`);
      console.log(`   Split Date: ${confirmation.confirmation.polygon?.splitDate || confirmation.confirmation.yahoo?.splitDate}`);

      // 3. Aplikuj korekciu
      const correction = await this.detector.applySplitCorrection(symbol, {
        splitRatio: confirmation.confirmation.polygon?.splitRatio || confirmation.confirmation.yahoo?.splitRatio,
        splitDate: confirmation.confirmation.polygon?.splitDate || confirmation.confirmation.yahoo?.splitDate,
        source: confirmation.overall ? 'confirmed' : 'detected'
      });

      return {
        symbol,
        splitDetected: true,
        detection,
        confirmation,
        correction
      };

    } catch (error) {
      console.error(`Error processing ${symbol} for split detection:`, error.message);
      return {
        symbol,
        splitDetected: false,
        error: error.message
      };
    }
  }
}

// ===== TEST SCENÁRE =====
async function testSplitDetection() {
  console.log('🧪 TESTOVANIE SPLIT DETECTION');
  console.log('===============================');

  const worker = new SplitHandlingWorker();

  // Test scenáre
  const testCases = [
    {
      name: 'NVDA 1:10 Split',
      symbol: 'NVDA',
      currentPrice: 120,
      previousClose: 1200,
      volume: 50000000
    },
    {
      name: 'AAPL 4:1 Split',
      symbol: 'AAPL',
      currentPrice: 25,
      previousClose: 100,
      volume: 100000000
    },
    {
      name: 'Normal Movement',
      symbol: 'MSFT',
      currentPrice: 380,
      previousClose: 383,
      volume: 25000000
    },
    {
      name: 'Extreme Drop (not split)',
      symbol: 'TSLA',
      currentPrice: 150,
      previousClose: 200,
      volume: 15000000
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📊 Test Case: ${testCase.name}`);
    console.log(`   Symbol: ${testCase.symbol}`);
    console.log(`   Current: $${testCase.currentPrice}`);
    console.log(`   Previous: $${testCase.previousClose}`);
    console.log(`   Volume: ${(testCase.volume / 1000000).toFixed(1)}M`);

    const result = await worker.processTickerWithSplitDetection(
      testCase.symbol,
      testCase.currentPrice,
      testCase.previousClose,
      testCase.volume
    );

    console.log(`   Výsledok: ${result.splitDetected ? 'SPLIT DETEKOVANÝ' : 'Žiadny split'}`);
    if (result.splitDetected) {
      console.log(`   Split Ratio: ${result.confirmation?.confirmation?.polygon?.splitRatio || result.confirmation?.confirmation?.yahoo?.splitRatio}`);
    }
  }
}

// ===== MAIN =====
if (require.main === module) {
  testSplitDetection().catch(console.error);
}

module.exports = { StockSplitDetector, SplitHandlingWorker };
