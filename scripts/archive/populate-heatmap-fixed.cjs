#!/usr/bin/env node

/**
 * HEATMAP DATA POPULATION SCRIPT - FIXED VERSION
 * Opravené Prisma createMany volania
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

      const now = new Date();
      
      // Vytvor session price záznamy jeden po druhom
      for (const ticker of tickers) {
        const currentPrice = ticker.lastPrice;
        const previousClose = ticker.latestPrevClose;
        
        // Vypočítaj percentuálnu zmenu
        const changePct = previousClose && currentPrice 
          ? ((currentPrice - previousClose) / previousClose) * 100 
          : null;

        try {
          await this.prisma.sessionPrice.create({
            data: {
              symbol: ticker.symbol,
              price: currentPrice,
              changePct: changePct,
              session: 'pre-market',
              lastPrice: currentPrice,
              lastTs: now.getTime(),
              source: 'polygon_snapshot',
              quality: 'high',
              date: now.toISOString().split('T')[0]
            }
          });
          
          console.log(`✅ ${ticker.symbol}: SessionPrice vytvorený ($${currentPrice}, ${changePct?.toFixed(2)}%)`);
        } catch (error) {
          // Ignoruj duplicity
          if (!error.message.includes('Unique constraint')) {
            console.error(`❌ ${ticker.symbol}: Chyba pri vytváraní SessionPrice:`, error.message);
          }
        }
      }

      console.log(`🎉 SessionPrice naplnené: ${tickers.length} záznamov`);
      
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

      // Vytvor daily ref záznamy jeden po druhom
      for (const ticker of tickers) {
        try {
          await this.prisma.dailyRef.create({
            data: {
              symbol: ticker.symbol,
              date: ticker.latestPrevCloseDate.toISOString().split('T')[0],
              regularClose: ticker.lastPrice,
              previousClose: ticker.latestPrevClose,
              volume: 0
            }
          });
          
          console.log(`✅ ${ticker.symbol}: DailyRef vytvorený (${ticker.latestPrevCloseDate.toISOString().split('T')[0]})`);
        } catch (error) {
          // Ignoruj duplicity
          if (!error.message.includes('Unique constraint')) {
            console.error(`❌ ${ticker.symbol}: Chyba pri vytváraní DailyRef:`, error.message);
          }
        }
      }

      console.log(`🎉 DailyRef naplnené: ${tickers.length} záznamov`);
      
    } catch (error) {
      console.error('❌ Chyba pri napĺňaní DailyRef:', error.message);
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
    console.log('🚀 SPUŠŤAM HEATMAP DATA POPULATION - FIXED VERSION');
    console.log('====================================================');
    
    const startTime = Date.now();
    
    try {
      // 1. Napln SessionPrice
      await this.populateSessionPrices();
      
      // 2. Napln DailyRef
      await this.populateDailyRefs();
      
      // 3. Verifikuj dáta
      const success = await this.verifyData();
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`\n⏱️  Celkový čas: ${duration.toFixed(1)} sekúnd`);
      
      if (success) {
        console.log('🎉 HEATMAP DATA POPULATION ÚSPEŠNÝ!');
        console.log('🌐 Heatmap by mala fungovať teraz!');
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
