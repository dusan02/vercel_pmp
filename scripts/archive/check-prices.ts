import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPrices() {
    const data = await prisma.ticker.findMany({
        where: { symbol: { in: ['AXON', 'COIN'] } },
        select: {
            symbol: true,
            lastPrice: true,
            latestPrevClose: true,
            lastChangePct: true,
            lastPriceUpdated: true,
            latestPrevCloseDate: true
        }
    });
    console.log(JSON.stringify(data, null, 2));
}

checkPrices().finally(() => prisma.$disconnect());
