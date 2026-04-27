import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixValuationData() {
    console.log('🚀 Začínam opravu historických dát a valuácií...');

    try {
        // KROK 1: Oprava zlých sharesOutstanding
        console.log('\n1️⃣ Hľadám a opravujem záporné sharesOutstanding vo FinancialStatement...');
        
        const badStmts = await prisma.financialStatement.findMany({
            where: { sharesOutstanding: { lt: 0 } }
        });
        
        console.log(`Našlo sa ${badStmts.length} chybných záznamov s negatívnymi akciami.`);
        
        if (badStmts.length > 0) {
            // Nastavíme ich na null, nech si výpočet vezme radšej sharesOutstanding z predošlého štvrťroka
            const updated = await prisma.financialStatement.updateMany({
                where: { sharesOutstanding: { lt: 0 } },
                data: { sharesOutstanding: null }
            });
            console.log(`✅ Opravených ${updated.count} záznamov vo FinancialStatement.`);
        } else {
            console.log(`✅ Všetko vyzerá v poriadku.`);
        }

        // KROK 2: Prepočítanie DailyValuationHistory
        console.log('\n2️⃣ Prepočítavam P/E, P/S a Market Cap v DailyValuationHistory...');
        
        // Zoberieme len tickery, ktoré majú dáta
        const tickers = await prisma.dailyValuationHistory.groupBy({
            by: ['symbol'],
        });

        console.log(`Našlo sa ${tickers.length} tickerov na prepočet.`);

        let processedCount = 0;
        let batchUpdates = [];
        
        for (const { symbol } of tickers) {
            const statements = await prisma.financialStatement.findMany({
                where: { symbol },
                orderBy: { endDate: 'desc' },
            });

            if (statements.length === 0) continue;

            const histories = await prisma.dailyValuationHistory.findMany({
                where: { symbol },
                orderBy: { date: 'asc' }
            });

            for (const history of histories) {
                if (!history.closePrice) continue;

                const date = history.date;
                const closePrice = history.closePrice;

                // Rovnaká logika ako v AnalysisService
                const annualStmt = statements.find(s =>
                    s.endDate.getTime() <= date.getTime() &&
                    (s.fiscalPeriod === 'FY' || s.period === 'annual')
                );
                
                // Fallback na Q, alebo najstarší známy
                const stmt = annualStmt ||
                    statements.find(s => s.endDate.getTime() <= date.getTime()) ||
                    statements[statements.length - 1];

                if (stmt && stmt.sharesOutstanding) {
                    const marketCap = closePrice * stmt.sharesOutstanding;
                    
                    let peRatio = null;
                    if (stmt.netIncome && stmt.netIncome > 0) {
                        peRatio = closePrice / (stmt.netIncome / stmt.sharesOutstanding);
                    }

                    let psRatio = null;
                    if (stmt.revenue && stmt.revenue > 0) {
                        psRatio = closePrice / (stmt.revenue / stmt.sharesOutstanding);
                    }

                    let evEbitda = null;
                    if (stmt.ebit && stmt.ebit > 0 && stmt.totalDebt !== null && stmt.cashAndEquivalents !== null) {
                        const ev = marketCap + stmt.totalDebt - stmt.cashAndEquivalents;
                        evEbitda = ev / stmt.ebit;
                    }

                    let fcfYield = null;
                    if (stmt.operatingCashFlow !== null && stmt.capex !== null && marketCap > 0) {
                        const fcf = stmt.operatingCashFlow - Math.abs(stmt.capex);
                        fcfYield = fcf / marketCap;
                    }

                    batchUpdates.push(
                        prisma.dailyValuationHistory.update({
                            where: { id: history.id },
                            data: { marketCap, peRatio, psRatio, evEbitda, fcfYield }
                        })
                    );
                }

                // Spustenie dávky ak ich je dosť, aby sme nepreťažili pamäť
                if (batchUpdates.length >= 5000) {
                    await prisma.$transaction(batchUpdates);
                    processedCount += batchUpdates.length;
                    console.log(`... prepočítaných ${processedCount} historických dní.`);
                    batchUpdates = [];
                }
            }
        }

        // Zvyšné updaty
        if (batchUpdates.length > 0) {
            await prisma.$transaction(batchUpdates);
            processedCount += batchUpdates.length;
            console.log(`... prepočítaných ${processedCount} historických dní.`);
        }

        console.log(`\n🎉 Úspešne opravených a prepočítaných celkovo ${processedCount} dní histórie!`);

    } catch (error) {
        console.error('❌ Nastala chyba pri oprave:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Spustenie
if (process.argv[1] && import.meta.url && import.meta.url.endsWith(process.argv[1].split('/').pop() || '')) {
    fixValuationData();
} else if (require.main === module) {
    fixValuationData();
}
