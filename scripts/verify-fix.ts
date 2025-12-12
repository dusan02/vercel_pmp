
import { prisma } from '../src/lib/db/prisma';

async function main() {
    const symbol = 'GLCNF';
    console.log(`Checking ${symbol}...`);
    const ticker = await prisma.ticker.findUnique({ where: { symbol } });
    console.log('Ticker:', ticker);
}

main().finally(() => prisma.$disconnect());
