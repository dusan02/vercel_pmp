
const { AnalysisService } = require('./src/services/analysisService');
const { prisma } = require('./src/lib/db/prisma');

async function verifyHII() {
    const symbol = 'HII';
    console.log(`Verifying fix for ${symbol}...`);
    
    try {
        await AnalysisService.syncFinancials(symbol);
        console.log('✅ syncFinancials complete');
        
        const latest = await prisma.financialStatement.findFirst({
            where: { symbol, fiscalPeriod: 'FY' },
            orderBy: { endDate: 'desc' }
        });

        if (latest) {
            console.log(`Latest FY Statement: ${latest.fiscalYear} - EndDate: ${latest.endDate.toISOString()}`);
            console.log(`Cash: ${latest.cashAndEquivalents}`);
            console.log(`Debt: ${latest.totalDebt}`);
            
            if (latest.cashAndEquivalents) {
                console.log('🎉 SUCCESS: Cash is now extracted correctly!');
            } else {
                console.log('❌ FAIL: Cash is still missing.');
            }
        } else {
            console.log('❌ FAIL: No FY statement found.');
        }

    } catch (e) {
        console.error('Error during verification:', e);
    } finally {
        await prisma.$disconnect();
    }
}

verifyHII();
