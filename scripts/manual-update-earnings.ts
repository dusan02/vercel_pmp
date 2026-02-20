// @ts-nocheck
import { checkEarningsForOurTickers } from '../src/lib/clients/yahooFinanceScraper';
import { prisma } from '../src/lib/db/prisma';

async function main() {
    const date = process.argv[2] || new Date().toISOString().split('T')[0];
    console.log(`🚀 Starting manual earnings update for ${date}`);

    try {
        const result = await checkEarningsForOurTickers(date, 'pmp');
        console.log(`✅ Found ${result.totalFound} earnings (Pre: ${result.preMarket.length}, After: ${result.afterMarket.length})`);

        const records = [];

        // Add pre-market
        for (const ticker of result.preMarket) {
            records.push({
                ticker,
                companyName: ticker,
                date: new Date(date + 'T00:00:00Z'),
                time: 'before'
            });
        }

        // Add after-market
        for (const ticker of result.afterMarket) {
            records.push({
                ticker,
                companyName: ticker,
                date: new Date(date + 'T00:00:00Z'),
                time: 'after'
            });
        }

        if (records.length > 0) {
            console.log(`🗑️ Clearing existing records for ${date}...`);
            await prisma.earningsCalendar.deleteMany({
                where: {
                    date: {
                        gte: new Date(date + 'T00:00:00Z'),
                        lt: new Date(date + 'T23:59:59Z')
                    }
                }
            });

            console.log(`💾 Saving ${records.length} records to DB...`);
            for (const record of records) {
                await prisma.earningsCalendar.create({
                    data: record
                });
            }
            console.log('✅ Success!');
        } else {
            console.log('⚠️ No records to save.');
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
