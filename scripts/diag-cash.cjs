#!/usr/bin/env node
/**
 * Diagnostic: Check cashAndEquivalents in DB and raw Finnhub XBRL for a ticker
 * Usage: node scripts/diag-cash.cjs META [MSFT]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

async function main() {
    const tickers = process.argv.slice(2);
    if (tickers.length === 0) {
        tickers.push('META', 'MSFT', 'AAPL', 'GOOGL', 'NVDA');
    }

    console.log(`\n🔍 Cash Diagnostic — ${new Date().toISOString()}\n`);

    // 1. Check DB values
    console.log('═══ DB cashAndEquivalents (Annual statements) ═══');
    for (const sym of tickers) {
        const stmts = await prisma.financialStatement.findMany({
            where: { symbol: sym, fiscalPeriod: 'FY' },
            orderBy: { endDate: 'desc' },
            take: 5,
            select: { fiscalYear: true, fiscalPeriod: true, cashAndEquivalents: true, totalDebt: true, currentAssets: true, totalAssets: true }
        });
        console.log(`\n  ${sym}:`);
        if (stmts.length === 0) {
            console.log('    No FY statements found');
            continue;
        }
        for (const s of stmts) {
            const cash = s.cashAndEquivalents !== null ? `$${(s.cashAndEquivalents / 1e9).toFixed(2)}B` : 'NULL';
            const debt = s.totalDebt !== null ? `$${(s.totalDebt / 1e9).toFixed(2)}B` : 'NULL';
            const ca = s.currentAssets !== null ? `$${(s.currentAssets / 1e9).toFixed(2)}B` : 'NULL';
            console.log(`    FY${s.fiscalYear}: cash=${cash}  debt=${debt}  currentAssets=${ca}`);
        }
    }

    // 2. Check raw Finnhub XBRL for cash-related concepts
    if (FINNHUB_KEY) {
        console.log('\n═══ Raw Finnhub XBRL cash concepts ═══');
        const cashConcepts = [
            'us-gaap_CashAndCashEquivalentsAtCarryingValue',
            'us-gaap_CashCashEquivalentsAndShortTermInvestments',
            'us-gaap_Cash',
            'us-gaap_CashAndShortTermInvestments',
            'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
            'us-gaap_CashEquivalentsAtCarryingValue',
            'us-gaap_MarketableSecuritiesCurrent',
            'us-gaap_ShortTermInvestments',
            'us-gaap_AvailableForSaleSecuritiesDebtSecuritiesCurrent',
            'us-gaap_CashCashEquivalentsAndFederalFundsSold',
            'us-gaap_RestrictedCashAndCashEquivalentsAtCarryingValue',
            'us-gaap_OtherShortTermInvestments',
        ];

        for (const sym of tickers) {
            console.log(`\n  ${sym} — Latest Annual Report:`);
            try {
                const url = `https://finnhub.io/api/v1/stock/financials-reported?symbol=${sym}&freq=annual&token=${FINNHUB_KEY}`;
                const res = await fetch(url);
                const data = await res.json();
                const latest = data.data?.[0];
                if (!latest || !latest.report) {
                    console.log('    No data from Finnhub');
                    continue;
                }
                console.log(`    Period: ${latest.year} (${latest.endDate})`);
                const bs = latest.report.bs || [];
                
                // Find all cash-related items
                const found = [];
                for (const item of bs) {
                    const concept = item.concept || '';
                    if (concept.toLowerCase().includes('cash') || 
                        concept.toLowerCase().includes('shortterm') ||
                        concept.toLowerCase().includes('short_term') ||
                        concept.toLowerCase().includes('marketable') ||
                        concept.toLowerCase().includes('investment') ||
                        cashConcepts.includes(concept)) {
                        found.push({ concept, value: item.value, unit: item.unit });
                    }
                }
                
                if (found.length === 0) {
                    console.log('    ⚠️  NO cash-related XBRL concepts found!');
                    // Dump all BS concepts for debugging
                    console.log('    All BS concepts:');
                    for (const item of bs.slice(0, 30)) {
                        console.log(`      ${item.concept} = ${item.value}`);
                    }
                } else {
                    for (const f of found) {
                        const valStr = f.value >= 1e9 ? `$${(f.value / 1e9).toFixed(2)}B` : `$${(f.value / 1e6).toFixed(0)}M`;
                        const match = cashConcepts.includes(f.concept) ? '✅ MATCHED' : '❌ NOT EXTRACTED';
                        console.log(`    ${match} ${f.concept} = ${valStr}`);
                    }
                }
            } catch (e) {
                console.log(`    Error: ${e.message}`);
            }
        }
    } else {
        console.log('\n⚠️  FINNHUB_API_KEY not set — skipping raw XBRL check');
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
