import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    const dateStr = process.argv[2] || new Date().toISOString().split('T')[0];

    console.log(`🔍 Checking earnings for ${dateStr}...`);

    const earnings = await prisma.earningsCalendar.findMany({
        where: {
            date: {
                gte: new Date(dateStr + 'T00:00:00Z'),
                lt: new Date(dateStr + 'T23:59:59Z')
            }
        }
    });

    console.log(`📊 Found ${earnings.length} earnings records.`);

    if (earnings.length > 0) {
        console.log('Tickers:', earnings.map(e => e.ticker).join(', '));
    } else {
        // Check if there are ANY earnings at all
        const totalCount = await prisma.earningsCalendar.count();
        console.log(`📊 Total records in earningsCalendar table: ${totalCount}`);

        const latest = await prisma.earningsCalendar.findFirst({
            orderBy: { date: 'desc' }
        });

        if (latest) {
            console.log(`📅 Latest earnings record date: ${latest.date.toISOString().split('T')[0]}`);
        }
    }

    await prisma.$disconnect();
}

main().catch(console.error);
