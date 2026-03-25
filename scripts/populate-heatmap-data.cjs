#!/usr/bin/env node

/**
 * HEATMAP DATA POPULATION SCRIPT
 * Naplní SessionPrice a DailyRef tabuľky dátami pre heatmap
 */

const { PrismaClient } = require('@prisma/client');

const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

class HeatmapDataPopulator {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async populateSessionPrices() {
    console.log('🔄 Napĺňam SessionPrice dáta...');
    
    try {
      // Získaj všetky tickery s cenami
      const tickers = await this.prisma.ticker.findMany({
        where: {
          lastPrice: { not: null },
          latestPrevClose: { not: null }
        },
        select: {
          symbol: true,
          lastPrice: true,
          latestPrevClose: true
        }
      });

      console.log(`📊 Našiel ${tickers.length} tickerov s cenami`);

      let sessionPrices = [];
      const now = new Date();
      
      // Vytvor session price záznamy
      for (const ticker of tickers) {
        const currentPrice = ticker.lastPrice;
        const previousClose = ticker.latestPrevClose;
        
        // Vypočítaj percentuálnu zmenu
        const changePct = previousClose && currentPrice 
          ? ((currentPrice - previousClose) / previousClose) * 100 
          : null;

        sessionPrices.push({
          symbol: ticker.symbol,
          price: currentPrice,
          changePct: changePct,
          session: 'pre-market',
          lastPrice: currentPrice,
          lastTs: now.getTime(),
          source: 'polygon_snapshot',
          quality: 'high',
          date: now.toISOString().split('T')[0],
          ticker: {
            connect: { id: ticker.symbol }
          }
        });
      }

      // Vlož dáta v batchoch
      const batchSize = 100;
      for (let i = 0; i < sessionPrices.length; i += batchSize) {
        const batch = sessionPrices.slice(i, i + batchSize);
        
        try {
          await this.prisma.sessionPrice.createMany({
            data: batch,
            skipDuplicates: true
          });
          
          console.log(`✅ Vložených ${batch.length} SessionPrice záznamov (batch ${Math.floor(i/batchSize) + 1})`);
        } catch (error) {
          console.error(`❌ Chyba v batch ${Math.floor(i/batchSize) + 1}:`, error.message);
        }
      }

      console.log(`🎉 SessionPrice naplnené: ${sessionPrices.length} záznamov`);
      
    } catch (error) {
      console.error('❌ Chyba pri napĺňaní SessionPrice:', error.message);
    }
  }

  async populateDailyRefs() {
    console.log('🔄 Napĺňam DailyRef dáta...');
    
    try {
      // Získaj všetky tickery s cenami
      const tickers = await this.prisma.ticker.findMany({
        where: {
          lastPrice: { not: null },
          latestPrevClose: { not: null },
          latestPrevCloseDate: { not: null }
        },
        select: {
          symbol: true,
          lastPrice: true,
          latestPrevClose: true,
          latestPrevCloseDate: true
        }
      });

      console.log(`📊 Našiel ${tickers.length} tickerov s daily dátami`);

      let dailyRefs = [];
      const today = new Date().toISOString().split('T')[0];
      
      // Vytvor daily ref záznamy
      for (const ticker of tickers) {
        dailyRefs.push({
          symbol: ticker.symbol,
          date: ticker.latestPrevCloseDate.toISOString().split('T')[0],
          regularClose: ticker.lastPrice,
          previousClose: ticker.latestPrevClose,
          volume: 0, // Bude doplnené neskôr
          ticker: {
            connect: { id: ticker.symbol }
          }
        });
      }

      // Vlož dáta v batchoch
      const batchSize = 100;
      for (let i = 0; i < dailyRefs.length; i += batchSize) {
        const batch = dailyRefs.slice(i, i + batchSize);
        
        try {
          await this.prisma.dailyRef.createMany({
            data: batch,
            skipDuplicates: true
          });
          
          console.log(`✅ Vložených ${batch.length} DailyRef záznamov (batch ${Math.floor(i/batchSize) + 1})`);
        } catch (error) {
          console.error(`❌ Chyba v batch ${Math.floor(i/batchSize) + 1}:`, error.message);
        }
      }

      console.log(`🎉 DailyRef naplnené: ${dailyRefs.length} záznamov`);
      
    } catch (error) {
      console.error('❌ Chyba pri napĺňaní DailyRef:', error.message);
    }
  }

  async fetchHistoricalData(symbol, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);

      const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&apiKey=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        return data.results;
      }
      
      return [];
    } catch (error) {
      console.error(`❌ Chyba pri načítaní historických dát pre ${symbol}:`, error.message);
      return [];
    }
  }

  async populateHistoricalDailyRefs() {
    console.log('🔄 Napĺňam historické DailyRef dáta...');
    
    try {
      // Získaj všetky tickery
      const tickers = await this.prisma.ticker.findMany({
        select: { symbol: true },
        take: 50 // Limit pre testovanie
      });

      console.log(`📊 Spracovávam ${tickers.length} tickerov pre historické dáta`);

      for (const ticker of tickers) {
        console.log(`📈 Načítavam historické dáta pre ${ticker.symbol}...`);
        
        const historicalData = await this.fetchHistoricalData(ticker.symbol, 7);
        
        if (historicalData.length > 0) {
          const dailyRefs = historicalData.map(day => ({
            symbol: ticker.symbol,
            date: new Date(day.t).toISOString().split('T')[0],
            regularClose: day.c,
            previousClose: historicalData[historicalData.indexOf(day) - 1]?.c || day.c,
            volume: day.v,
            ticker: {
              connect: { id: ticker.symbol }
            }
          }));

          // Vlož dáta
          try {
            await this.prisma.dailyRef.createMany({
              data: dailyRefs,
              skipDuplicates: true
            });
            
            console.log(`✅ ${ticker.symbol}: Vložených ${dailyRefs.length} historických dní`);
          } catch (error) {
            console.error(`❌ ${ticker.symbol}: Chyba pri vkladaní historických dát:`, error.message);
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log('🎉 Historické DailyRef dáta naplnené');
      
    } catch (error) {
      console.error('❌ Chyba pri napĺňaní historických DailyRef:', error.message);
    }
  }

  async verifyData() {
    console.log('🔍 Verifikujem naplnené dáta...');
    
    try {
      const sessionCount = await this.prisma.sessionPrice.count();
      const dailyRefCount = await this.prisma.dailyRef.count();
      
      console.log(`📊 Výsledky verifikácie:`);
      console.log(`   - SessionPrice záznamov: ${sessionCount}`);
      console.log(`   - DailyRef záznamov: ${dailyRefCount}`);
      
      if (sessionCount > 0 && dailyRefCount > 0) {
        console.log('✅ Heatmap dáta sú pripravené!');
        return true;
      } else {
        console.log('❌ Heatmap dáta stále chýbajú');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Chyba pri verifikácii:', error.message);
      return false;
    }
  }

  async run() {
    console.log('🚀 SPUŠŤAM HEATMAP DATA POPULATION');
    console.log('====================================');
    
    const startTime = Date.now();
    
    try {
      // 1. Napln SessionPrice
      await this.populateSessionPrices();
      
      // 2. Napln DailyRef
      await this.populateDailyRefs();
      
      // 3. Napln historické dáta (voliteľné)
      await this.populateHistoricalDailyRefs();
      
      // 4. Verifikuj dáta
      const success = await this.verifyData();
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`\n⏱️  Celkový čas: ${duration.toFixed(1)} sekúnd`);
      
      if (success) {
        console.log('🎉 HEATMAP DATA POPULATION ÚSPEŠNÝ!');
      } else {
        console.log('❌ HEATMAP DATA POPULATION ZLYHAL!');
      }
      
    } catch (error) {
      console.error('❌ Kritická chyba:', error.message);
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

// MAIN
if (require.main === module) {
  const populator = new HeatmapDataPopulator();
  populator.run().catch(console.error);
}

module.exports = { HeatmapDataPopulator };
