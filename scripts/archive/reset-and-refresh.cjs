#!/usr/bin/env node

/**
 * Reset application and refresh all data
 */

const { execSync } = require('child_process');

console.log('🔄 Starting application reset and data refresh...');

async function resetAndRefresh() {
  try {
    console.log('📝 KROK 1: Reštart aplikácie...');
    execSync('pm2 restart premarketprice', { stdio: 'inherit' });
    
    console.log('\n📝 KROK 2: Vyčistenie Redis cache...');
    execSync('redis-cli FLUSHALL', { stdio: 'inherit' });
    
    console.log('\n📝 KROK 3: Načítanie nových dát...');
    execSync('POLYGON_API_KEY=Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX FINNHUB_API_KEY=d28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0 DATABASE_URL="file:./prisma/dev.db" npm run db:update-static', { 
      stdio: 'inherit',
      timeout: 300000 // 5 minutes timeout
    });
    
    console.log('\n📝 KROK 4: Verifikácia dát...');
    const result = execSync('curl -s "http://localhost:3000/api/stocks?tickers=AAPL,MSFT,GOOGL&project=pmp"', { encoding: 'utf8' });
    const data = JSON.parse(result);
    
    if (data.success && data.data) {
      console.log('\n✅ VÝSLEDKY VERIFIKÁCIE:');
      data.data.forEach(stock => {
        console.log(`   ${stock.ticker}: $${stock.currentPrice} (Market Cap: $${stock.marketCap}B)`);
      });
    } else {
      console.log('❌ Verifikácia zlyhala');
    }
    
    console.log('\n📝 KROK 5: Bulk sector fix...');
    try {
      execSync('node scripts/bulk-sector-fix.cjs', { stdio: 'inherit', timeout: 60000 });
    } catch (error) {
      console.log('⚠️ Bulk sector finishel (timeout alebo iná chyba)');
    }
    
    console.log('\n🎉 RESET A REFRESH DOKONČENÝ!');
    
  } catch (error) {
    console.error('❌ Chyba počas resetu:', error.message);
    process.exit(1);
  }
}

resetAndRefresh().catch(console.error);
