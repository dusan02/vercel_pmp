const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.dailyValuationHistory.count();
  const nvdaCount = await prisma.dailyValuationHistory.count({ where: { symbol: 'NVDA' } });
  const sample = await prisma.dailyValuationHistory.findFirst({
    where: { symbol: 'NVDA' },
    orderBy: { date: 'desc' }
  });
  console.log(`Total DailyValuationHistory rows: ${count}`);
  console.log(`NVDA rows: ${nvdaCount}`);
  console.log('Sample NVDA row:', sample);
  process.exit(0);
}
main();
