import { PrismaClient } from '../p4-engine/db/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.PIT_DATABASE_URL || "postgresql://postgres:postgres@localhost:54320/postgres?schema=public" } } });
const SYSTEM_LATENCY_MS = 2 * 60 * 60 * 1000;

async function main() {
    console.log("=== R2-A.2 UNIVERSE/LIFECYCLE INGESTION ===");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PitLifecycleFact" CASCADE;`);
    
    // We will inject LEHMQ (Lehman Brothers) - a real historical bankrupt/delisted security.
    let lehmqEntity = await prisma.pitEntity.findFirst({ where: { cik: '0000806085' } });
    if (!lehmqEntity) {
        lehmqEntity = await prisma.pitEntity.create({ data: { cik: '0000806085', name: 'LEHMAN BROTHERS HOLDINGS INC' } });
    }
    
    let lehmqSec = await prisma.pitSecurity.findFirst({ where: { entityId: lehmqEntity.id } });
    if (!lehmqSec) {
        lehmqSec = await prisma.pitSecurity.create({ data: { entityId: lehmqEntity.id, issueType: 'CS' } });
        await prisma.pitTickerHistory.create({ data: { securityId: lehmqSec.id, ticker: 'LEH', startDate: new Date('1994-05-31'), endDate: new Date('2008-09-17') } });
        await prisma.pitTickerHistory.create({ data: { securityId: lehmqSec.id, ticker: 'LEHMQ', startDate: new Date('2008-09-17') } });
    }

    // LISTED event for Lehman
    await prisma.pitLifecycleFact.create({
        data: {
            securityId: lehmqSec.id,
            status: 'LISTED',
            effectiveDate: new Date('1994-05-31T00:00:00Z'),
            publishedAt: new Date('1994-05-31T00:00:00Z'),
            availableAt: new Date('1994-05-31T02:00:00Z'), // Knowledge System Latency
        }
    });

    // DELISTED event for Lehman (Bankruptcy announced slightly before effective delisting)
    await prisma.pitLifecycleFact.create({
        data: {
            securityId: lehmqSec.id,
            status: 'DELISTED',
            effectiveDate: new Date('2008-09-17T00:00:00Z'), // Actually effective/delisted
            publishedAt: new Date('2008-09-15T00:00:00Z'), // Announced bankruptcy
            availableAt: new Date('2008-09-15T02:00:00Z'), 
        }
    });

    // We will also ensure META is handled correctly
    const metaEntity = await prisma.pitEntity.findFirst({ where: { cik: '0001326801' } });
    const metaSec = await prisma.pitSecurity.findFirst({ where: { entityId: metaEntity!.id } });
    
    await prisma.pitLifecycleFact.create({
        data: {
            securityId: metaSec!.id,
            status: 'LISTED',
            effectiveDate: new Date('2012-05-18T00:00:00Z'),
            publishedAt: new Date('2012-05-18T00:00:00Z'),
            availableAt: new Date('2012-05-18T02:00:00Z'),
        }
    });

    console.log("Lifecycle ingestion complete.");
}

main().finally(() => prisma.$disconnect());
