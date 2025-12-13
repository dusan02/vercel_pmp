import { prisma } from '../src/lib/db/prisma.js';

async function checkSectorIndustry() {
    const tickers = ['PBR', 'VALE', 'ABEV', 'TSM', 'BABA', 'NVO', 'ASML', 'NESN'];

    const stocks = await prisma.ticker.findMany({
        where: { symbol: { in: tickers } },
        select: {
            symbol: true,
            name: true,
            sector: true,
            industry: true
        }
    });

    console.log('Current sector/industry data:');
    console.log(JSON.stringify(stocks, null, 2));

    await prisma.$disconnect();
}

checkSectorIndustry().catch(console.error);
