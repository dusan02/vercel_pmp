import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const t = await prisma.ticker.findUnique({ where: { symbol: 'CHTR' } });
  console.log(t);
  const dr = await prisma.dailyRef.findMany({ where: { symbol: 'CHTR' }, orderBy: { date: 'desc' }, take: 5 });
  console.log("DailyRefs:", dr);
}
main().finally(() => prisma.$disconnect());
