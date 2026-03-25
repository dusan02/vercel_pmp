#!/usr/bin/env node

/**
 * KOREKTNE HEATMAP DATA POPULATION
 * Používa správne názvy polí podľa Prisma schema
 */

const { PrismaClient } = require('@prisma/client');

class CorrectHeatmapFix {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async populateSessionPrices() {
    console.log('🔄 Napĺňam SessionPrice dáta (KOREKTNE)...');
    
    try {
      // Získaj 10 tickerov s cenami
      const tickers = await this.prisma.ticker.findMany({
        where: {
          lastPrice: { not: null },
          latestPrevClose: { not: null }
        },
        select: {
          symbol: true,
          lastPrice: true,
          latestPrevClose: true
        },
        take: 10
      });

      console.log(`📊 Našiel ${tickers.length} tickerov s cenami`);

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      for (const ticker of tickers) {
        const currentPrice = ticker.lastPrice;
        const previousClose = ticker.latestPrevClose;
        const changePct = previousClose && currentPrice 
          ? ((currentPrice - previousClose) / previousClose) * 100 
          : null;

        try {
          await this.prisma.sessionPrice.create({
            data: {
              symbol: ticker.symbol,
              date: new Date(today), // DateTime object
              session: 'pre-market',
              lastPrice: currentPrice,
              lastTs: now,
              changePct: changePct,
              source: 'manual_fix',
              quality: 'high'
            }
          });

          console.log(`✅ ${ticker.symbol}: SessionPrice $${currentPrice} (${changePct?.toFixed(2)}%)`);
        } catch (error) {
          if (error.message.includes('Unique constraint')) {
            console.log(`⚠️  ${ticker.symbol}: Už existuje`);
          } else {
            console.error(`❌ ${ticker.symbol}: ${error.message}`);
          }
        }
      }

      console.log(`🎉 SessionPrice vytvorené pre ${tickers.length} tickerov`);
      
    } catch (error) {
      console.error('❌ Chyba pri SessionPrice:', error.message);
    }
  }

  async populateDailyRefs() {
    console.log('🔄 Napĺňam DailyRef dáta (KOREKTNE)...');
    
    try {
      // Získaj 10 tickerov s cenami
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
        },
        take: 10
      });

      console.log(`📊 Našiel ${tickers.length} tickerov s daily dátami`);

      for (const ticker of tickers) {
        try {
          await this.prisma.dailyRef.create({
            data: {
              symbol: ticker.symbol,
              date: ticker.latestPrevCloseDate, // DateTime object
              regularClose: ticker.lastPrice,
              previousClose: ticker.latestPrevClose,
              volume: 1000000 // Placeholder
            }
          });

          console.log(`✅ ${ticker.symbol}: DailyRef ${ticker.latestPrevCloseDate.toISOString().split('T')[0]} $${ticker.lastPrice}`);
        } catch (error) {
          if (error.message.includes('Unique constraint')) {
            console.log(`⚠️  ${ticker.symbol}: Už existuje`);
          } else {
            console.error(`❌ ${ticker.symbol}: ${error.message}`);
          }
        }
      }

      console.log(`🎉 DailyRef vytvorené pre ${tickers.length} tickerov`);
      
    } catch (error) {
      console.error('❌ Chyba pri DailyRef:', error.message);
    }
  }

  async verifyData() {
    console.log('🔍 Verifikujem dáta...');
    
    try {
      const sessionCount = await this.prisma.sessionPrice.count();
      const dailyRefCount = await this.prisma.dailyRef.count();
      
      console.log(`📊 Výsledky:`);
      console.log(`   - SessionPrice: ${sessionCount} záznamov`);
      console.log(`   - DailyRef: ${dailyRefCount} záznamov`);
      
      if (sessionCount > 0 && dailyRefCount > 0) {
        console.log('🎉 HEATMAP DÁTA SÚ PRIPRavenÉ!');
        return true;
      } else {
        console.log('❌ Dáta stále chýbajú');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Chyba pri verifikácii:', error.message);
      return false;
    }
  }

  async run() {
    console.log('🚀 KOREKTNE HEATMAP DATA POPULATION');
    console.log('====================================');
    
    const startTime = Date.now();
    
    try {
      await this.populateSessionPrices();
      await this.populateDailyRefs();
      
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
  const fixer = new CorrectHeatmapFix();
  fixer.run().catch(console.error);
}

module.exports = { CorrectHeatmapFix };
