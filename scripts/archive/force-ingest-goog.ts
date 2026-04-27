/**
 * Force ingest GOOG and GOOGL - bypass pricing state machine
 */

import { ingestBatch } from '../src/workers/polygonWorker';

async function main() {
  console.log('🔄 Starting FORCE ingest for GOOG and GOOGL...');
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }
  
  const tickers = ['GOOG', 'GOOGL'];
  console.log(`📊 Ingesting ${tickers.join(', ')}...`);
  
  try {
    // Use force=true to bypass pricing state machine
    console.log('\n⚠️  Note: Force ingest will bypass pricing state, but if market is closed,');
    console.log('   Polygon API may not return current prices (only previous close).');
    console.log('   This is expected behavior on weekends/holidays.\n');
    
    const results = await ingestBatch(tickers, apiKey, true);
    
    console.log('\n📊 Results:');
    results.forEach(r => {
      if (r.success) {
        console.log(`  ✅ ${r.symbol}: $${r.price.toFixed(2)} (${r.changePct > 0 ? '+' : ''}${r.changePct.toFixed(2)}%)`);
      } else {
        console.log(`  ❌ ${r.symbol}: ${r.error}`);
      }
    });
    
    const successCount = results.filter(r => r.success).length;
    console.log(`\n✅ Ingest complete: ${successCount}/${tickers.length} successful`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

