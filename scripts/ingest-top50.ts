import { getProjectTickers } from '@/data/defaultTickers';
import { ingestBatch } from '@/workers/polygonWorker';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }

  const top50 = getProjectTickers('pmp', 50);
  console.log(`📊 Ingesting top 50 tickers: ${top50.length} tickers`);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Check which are missing
  const inDb = await prisma.sessionPrice.findMany({
    where: {
      symbol: { in: top50 },
      date: today
    },
    select: { symbol: true }
  });
  
  const inDbSymbols = new Set(inDb.map(r => r.symbol));
  const missingTickers = top50.filter(t => !inDbSymbols.has(t));
  
  console.log(`📊 Already in DB: ${inDb.length}/50`);
  console.log(`📊 Missing: ${missingTickers.length}`);
  
  if (missingTickers.length > 0) {
    console.log(`\n🔄 Ingesting ${missingTickers.length} missing tickers...`);
    const results = await ingestBatch(missingTickers, apiKey);
    const successCount = results.filter(r => r.success).length;
    console.log(`\n✅ Ingest complete: ${successCount}/${missingTickers.length} successful`);
  } else {
    console.log('✅ All top 50 tickers already in DB');
  }
  
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

