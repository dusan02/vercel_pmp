import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const tickers = await p.ticker.findMany({
    select: { symbol: true, websiteUrl: true, logoUrl: true },
    take: 10
  });
  console.log(JSON.stringify(tickers, null, 2));
  const total = await p.ticker.count();
  const withWebsite = await p.ticker.count({ where: { websiteUrl: { not: null } } });
  const withLogo = await p.ticker.count({ where: { logoUrl: { not: null } } });
  console.log(`\nTotal tickers: ${total}`);
  console.log(`With websiteUrl: ${withWebsite}`);
  console.log(`With logoUrl: ${withLogo}`);
}
main().finally(() => p.$disconnect());
