
import { prisma } from '../src/lib/db/prisma';

async function main() {
    const ticker = await prisma.ticker.findUnique({
        where: { symbol: 'PANW' },
        select: { symbol: true, name: true, logoUrl: true }
    });
    console.log(JSON.stringify(ticker, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
