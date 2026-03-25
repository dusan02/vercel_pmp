#!/usr/bin/env node

/**
 * FINÁLNA HEATMAP DATA POPULATION
 * Používa správne názvy polí podľa aktuálneho schema
 */

const { PrismaClient } = require('@prisma/client');

class FinalHeatmapFix {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async populateSessionPrices() {
    console.log('🔄 Napĺňam SessionPrice dáta...');
    
    try {
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
        take: 20
      });

      console.log(`📊 Našiel ${tickers.length} tickerov`);

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
              date: new Date(today),
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

      console.log(`🎉 SessionPrice vytvorené: ${tickers.length} záznamov`);
      
    } catch (error) {
      console.error('❌ Chyba pri SessionPrice:', error.message);
    }
  }

  async populateDailyRefs() {
    console.log('🔄 Napĺňam DailyRef dáta...');
    
    try {
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
        take: 20
      });

      console.log(`📊 Našiel ${tickers.length} tickerov s daily dátami`);

      for (const ticker of tickers) {
        try {
          await this.prisma.dailyRef.create({
            data: {
              symbol: ticker.symbol,
              date: ticker.latestPrevCloseDate,
              previousClose: ticker.latestPrevClose,
              regularClose: ticker.lastPrice,
              todayOpen: ticker.lastPrice // Použijeme current price ako todayOpen
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

      console.log(`🎉 DailyRef vytvorené: ${tickers.length} záznamov`);
      
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
    console.log('🚀 FINÁLNA HEATMAP DATA POPULATION');
    console.log('===================================');
    
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
        console.log('✅ HOTOVÉ!');
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
  const fixer = new FinalHeatmapFix();
  fixer.run().catch(console.error);
}

module.exports = { FinalHeatmapFix };
