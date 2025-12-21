import { prisma } from '../src/lib/db/prisma';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

async function checkAllCompanies() {
  console.log('\n📊 PREHĽAD VŠETKÝCH FIRIEM V DATABÁZE\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Ticker tabuľka (hlavná tabuľka firiem)
    const tickerCount = await prisma.ticker.count();
    console.log(`\n✅ Ticker tabuľka (hlavná): ${tickerCount} firiem`);
    
    // 2. EarningsCalendar - počet unikátnych firiem
    const earningsCompanies = await prisma.earningsCalendar.findMany({
      select: { ticker: true, companyName: true },
      distinct: ['ticker']
    });
    console.log(`\n📅 EarningsCalendar: ${earningsCompanies.length} unikátnych firiem`);
    
    // 3. SessionPrice - počet unikátnych firiem
    const sessionPriceCompanies = await prisma.sessionPrice.findMany({
      select: { symbol: true },
      distinct: ['symbol']
    });
    console.log(`\n💰 SessionPrice: ${sessionPriceCompanies.length} unikátnych firiem`);
    
    // 4. DailyRef - počet unikátnych firiem
    const dailyRefCompanies = await prisma.dailyRef.findMany({
      select: { symbol: true },
      distinct: ['symbol']
    });
    console.log(`\n📊 DailyRef: ${dailyRefCompanies.length} unikátnych firiem`);
    
    // 5. Skontrolovať starú "stocks" tabuľku (ak existuje)
    const dbPath = path.join(process.cwd(), 'prisma/dev.db');
    if (fs.existsSync(dbPath)) {
      try {
        const db = new Database(dbPath, { readonly: true });
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name: string}>;
        
        if (tables.some(t => t.name === 'stocks')) {
          const stocksCount = db.prepare('SELECT COUNT(*) as count FROM stocks').get() as {count: number};
          console.log(`\n📦 stocks (stará tabuľka): ${stocksCount.count} firiem`);
        } else {
          console.log(`\n📦 stocks (stará tabuľka): neexistuje`);
        }
        
        db.close();
      } catch (err) {
        console.log(`\n📦 stocks (stará tabuľka): chyba pri kontrole`);
      }
    }
    
    // 6. Celkový prehľad
    console.log('\n' + '='.repeat(60));
    console.log('\n📈 SÚHRN:');
    console.log(`   • Hlavná tabuľka Ticker: ${tickerCount} firiem`);
    console.log(`   • Firma v EarningsCalendar: ${earningsCompanies.length}`);
    console.log(`   • Firma v SessionPrice: ${sessionPriceCompanies.length}`);
    console.log(`   • Firma v DailyRef: ${dailyRefCompanies.length}`);
    
    // 7. Vzorky firiem
    if (tickerCount > 0) {
      const sample = await prisma.ticker.findMany({ 
        take: 10,
        orderBy: { symbol: 'asc' }
      });
      console.log('\n📋 Vzorka firiem (prvých 10):');
      sample.forEach(t => {
        console.log(`   • ${t.symbol}: ${t.name || 'N/A'} (${t.sector || 'N/A'})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Chyba:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('\n' + '='.repeat(60));
}

checkAllCompanies().catch((error) => {
  console.error('❌ Fatálna chyba:', error);
  process.exit(1);
});

