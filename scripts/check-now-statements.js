const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const stmts = await p.financialStatement.findMany({
    where: { symbol: 'NOW', endDate: { gte: new Date('2024-01-01') } },
    orderBy: { endDate: 'desc' },
    select: { endDate: true, fiscalPeriod: true, fiscalYear: true, netIncome: true, revenue: true, sharesOutstanding: true }
  });
  for (const s of stmts) {
    const d = s.endDate.toISOString().split('T')[0];
    console.log(d + ' | ' + s.fiscalPeriod + ' FY' + s.fiscalYear + ' | NI: ' + s.netIncome + ' | Rev: ' + s.revenue + ' | Shares: ' + s.sharesOutstanding);
  }
  await p.$disconnect();
})();
