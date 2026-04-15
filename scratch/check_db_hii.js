
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
    const symbol = 'HII';
    console.log(`Checking DB for ${symbol}...`);
    
    const ticker = await prisma.ticker.findUnique({ where: { symbol } });
    console.log('Ticker:', JSON.stringify(ticker, null, 2));

    const stmts = await prisma.financialStatement.findMany({
        where: { symbol },
        orderBy: { endDate: 'desc' }
    });

    console.log(`Found ${stmts.length} statements.`);
    stmts.forEach(s => {
        console.log(`- ${s.fiscalYear} ${s.fiscalPeriod} (${s.endDate.toISOString()}): Cash=${s.cashAndEquivalents}, Debt=${s.totalDebt}, Assets=${s.totalAssets}`);
    });

    await prisma.$disconnect();
}

checkDb();
