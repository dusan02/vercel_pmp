#!/usr/bin/env node

/**
 * RYCHLÁ OPRAVA HEATMAP DÁT
 * Jednoduché vytvorenie záznamov bez komplexných dátumov
 */

const { PrismaClient } = require('@prisma/client');

class QuickHeatmapFix {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async quickFix() {
    console.log('🚀 RYCHLÁ OPRAVA HEATMAP DÁT');
    console.log('===================================');

    try {
      // Získaj 20 tickerov s cenami
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

      console.log(`📊 Spracovávam ${tickers.length} tickerov`);

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      for (const ticker of tickers) {
        const currentPrice = ticker.lastPrice;
        const previousClose = ticker.latestPrevClose;
        const changePct = previousClose && currentPrice 
          ? ((currentPrice - previousClose) / previousClose) * 100 
          : null;

        try {
          // Vytvor SessionPrice
          await this.prisma.sessionPrice.create({
            data: {
              symbol: ticker.symbol,
              price: currentPrice,
              changePct: changePct,
              session: 'pre-market',
              lastPrice: currentPrice,
              lastTs: Date.now(),
              source: 'manual_fix',
              quality: 'high',
              date: today
            }
          });

          // Vytvor DailyRef
          await this.prisma.dailyRef.create({
            data: {
              symbol: ticker.symbol,
              date: today,
              regularClose: currentPrice,
              previousClose: previousClose,
              volume: 1000000 // Placeholder
            }
          });

          console.log(`✅ ${ticker.symbol}: $${currentPrice} (${changePct?.toFixed(2)}%)`);
        } catch (error) {
          if (error.message.includes('Unique constraint')) {
            console.log(`⚠️  ${ticker.symbol}: Už existuje`);
          } else {
            console.error(`❌ ${ticker.symbol}: ${error.message}`);
          }
        }
      }

      // Verifikuj
      const sessionCount = await this.prisma.sessionPrice.count();
      const dailyRefCount = await this.prisma.dailyRef.count();

      console.log(`\n📊 Výsledky:`);
      console.log(`   - SessionPrice: ${sessionCount} záznamov`);
      console.log(`   - DailyRef: ${dailyRefCount} záznamov`);

      if (sessionCount > 0 && dailyRefCount > 0) {
        console.log('🎉 HEATMAP BY MALA FUNGOVAŤ!');
        return true;
      } else {
        console.log('❌ Stále problémy');
        return false;
      }

    } catch (error) {
      console.error('❌ Chyba:', error.message);
      return false;
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

// MAIN
if (require.main === module) {
  const fixer = new QuickHeatmapFix();
  fixer.quickFix().catch(console.error);
}

module.exports = { QuickHeatmapFix };
