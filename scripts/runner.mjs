process.env.FINNHUB_API_KEY='d28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';
process.env.POLYGON_API_KEY='Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
process.env.DATABASE_URL='file:./prisma/data/premarket.db';

import { AnalysisService } from '../src/services/analysisService';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    await AnalysisService.syncFinancials('META');
    const records = await prisma.financialStatement.findMany({
        where: { symbol: 'META' },
        orderBy: { endDate: 'desc' },
        take: 5
    });
    console.table(records.map(r => ({
        P: r.fiscalPeriod, 
        Y: r.fiscalYear, 
        NetInc: r.netIncome,
        Shares: r.sharesOutstanding,
        EPS: (r.netIncome && r.sharesOutstanding) ? r.netIncome / r.sharesOutstanding : null
    })));
}
check().catch(console.error);
