const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const symbol = 'NVDA';
    try {
        console.log('Testing Ticker.findUnique...');
        const ticker = await prisma.ticker.findUnique({
            where: { symbol },
            select: { 
                sector: true, 
                industry: true, 
                description: true, 
                websiteUrl: true, 
                name: true, 
                logoUrl: true, 
                employees: true, 
                lastPrice: true, 
                lastMarketCap: true 
            }
        });
        console.log('Ticker result:', ticker);

        console.log('Testing AnalysisCache.findUnique...');
        const analysis = await prisma.analysisCache.findUnique({ where: { symbol } });
        console.log('Analysis result:', analysis);

        console.log('Testing FinancialStatement.findMany...');
        const stmts = await prisma.financialStatement.findMany({
            where: { symbol },
            orderBy: { endDate: 'desc' },
            take: 1
        });
        console.log('Stmts result count:', stmts.length);

        console.log('Testing DailyValuationHistory.findFirst...');
        const latestValuation = await prisma.dailyValuationHistory.findFirst({
            where: { symbol },
            orderBy: { date: 'desc' }
        });
        console.log('Valuation result:', latestValuation);

    } catch (e) {
        console.error('Error during test:', e);
    } finally {
        await prisma.$disconnect();
    }
}

test();
