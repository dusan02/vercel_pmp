import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log("Looking for SQ...");
    const sq = await prisma.ticker.findFirst({ where: { symbol: 'SQ' } });
    console.log("SQ result:", sq);
}
main().finally(() => prisma.$disconnect());
