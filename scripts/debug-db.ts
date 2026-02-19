
import { PrismaClient } from '@prisma/client';
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

console.log('DB URL:', process.env.DATABASE_URL);

const prisma = new PrismaClient();

async function main() {
    const symbol = process.argv[2] || 'AAPL';
    const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { symbol: true, lastPrice: true, latestPrevClose: true, lastPriceUpdated: true, lastChangePct: true, lastMarketCap: true }
    });
    console.log(`${symbol}:`, ticker);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
