const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Fix shares outstanding for NOW statements with anomalous values
  // Q1 FY2026 and FY2025 have ~1.04B shares (5x too high, should be ~207M)
  const result = await p.financialStatement.updateMany({
    where: {
      symbol: 'NOW',
      sharesOutstanding: { gt: 500000000 },
    },
    data: {
      sharesOutstanding: 207000000,
    },
  });
  console.log('Updated ' + result.count + ' statements');

  // Verify
  const stmts = await p.financialStatement.findMany({
    where: { symbol: 'NOW', endDate: { gte: new Date('2024-01-01') } },
    orderBy: { endDate: 'desc' },
    select: { endDate: true, fiscalPeriod: true, fiscalYear: true, sharesOutstanding: true }
  });
  for (const s of stmts) {
    const d = s.endDate.toISOString().split('T')[0];
    console.log(d + ' | ' + s.fiscalPeriod + ' FY' + s.fiscalYear + ' | Shares: ' + s.sharesOutstanding);
  }
  await p.$disconnect();
})();
