const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const stmts = await prisma.financialStatement.findMany({
    where: { symbol: 'NVDA' },
    select: { endDate: true, period: true, sharesOutstanding: true, netIncome: true }
  });
  console.log(stmts.slice(0, 5));
  process.exit(0);
}
main();
