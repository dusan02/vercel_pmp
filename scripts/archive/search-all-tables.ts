// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function searchTables() {
  const search = 'MNDT';

  const tables = [
    'ticker', 'sessionPrice', 'dailyRef', 'moverEvent', 
    'portfolioItem', 'userFavorite', 'volumeBucket', 
    'financialStatement', 'dailyValuationHistory', 
    'analysisCache', 'valuationHistory', 'valuationPercentiles'
  ];

  for (const table of tables) {
    try {
      let records: any[] = [];
      
      // Try symbol
      try {
        const bySymbol = await (prisma as any)[table].findMany({
          where: { symbol: search },
          take: 5
        });
        records = [...records, ...bySymbol];
      } catch (e) { /* ignore if symbol doesn't exist */ }

      // Try ticker
      try {
        const byTicker = await (prisma as any)[table].findMany({
          where: { ticker: search },
          take: 5
        });
        // Avoid duplicates if both fields exist and match
        const existingIds = new Set(records.map(r => r.id));
        for (const r of byTicker) {
          if (!existingIds.has(r.id)) {
            records.push(r);
          }
        }
      } catch (e) { /* ignore if ticker doesn't exist */ }

      if (records.length > 0) {
        console.log(`✅ Found "${search}" in table: ${table}`);
        console.log(JSON.stringify(records, null, 2));
      }
    } catch (e) {
      console.error(`Error processing table ${table}:`, e);
    }
  }
}

searchTables().catch(console.error).finally(() => prisma.$disconnect());
