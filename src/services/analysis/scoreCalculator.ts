import { prisma } from '@/lib/db/prisma';
import { aiService } from '../aiService';
import { NotificationService } from '../notificationService';

/**
 * Calculate health, profitability, and valuation scores.
 * Computes Altman Z-Score, Piotroski F-Score, Beneish M-Score, FCF metrics,
 * and generates an AI investment verdict. Persists results to AnalysisCache.
 */
export async function calculateScores(symbol: string): Promise<void> {
    const stmts = await prisma.financialStatement.findMany({
        where: { symbol },
        orderBy: { endDate: 'desc' },
        take: 120
    });

    const latestStmt = stmts[0];
    if (!latestStmt) return;
    const annualStmts = stmts.filter(s => s.fiscalPeriod === 'FY');
    const quarterlyStmts = stmts.filter(s => s.fiscalPeriod !== 'FY');
    
    // Compute TTMs with de-cumulation (Finnhub reports cumulative quarterly values)
    const ttmStmts = quarterlyStmts.slice(0, 4);
    const has4Q = ttmStmts.length >= 4;
    
    function deCumulateTtm(field: string): number | null {
        if (!has4Q) return null;
        let sum = 0;
        let valid = false;
        for (let i = 0; i < ttmStmts.length; i++) {
            const s = ttmStmts[i]!;
            const val = s[field as keyof typeof s] as number | null;
            if (val == null) continue;
            if (s.fiscalPeriod === 'Q1') {
                sum += val;
                valid = true;
            } else {
                const prev = ttmStmts[i + 1];
                if (prev && prev.fiscalYear === s.fiscalYear && prev.fiscalPeriod !== 'FY') {
                    const prevVal = prev[field as keyof typeof prev] as number | null;
                    if (prevVal != null) {
                        sum += val - prevVal;
                        valid = true;
                    }
                }
            }
        }
        return valid ? sum : null;
    }
    
    const ttmNetIncome = deCumulateTtm('netIncome');
    const ttmRevenue = deCumulateTtm('revenue');
    const ttmEbit = deCumulateTtm('ebit');
    const ttmOcf = deCumulateTtm('operatingCashFlow');
    const ttmCapex = deCumulateTtm('capex');

    let healthScore = 50;
    let valuationScore = 50;
    let profitabilityScore = 50;
    let verdictText = 'Neutral';

    const tickerData = await prisma.ticker.findUnique({
        where: { symbol },
        select: { lastPrice: true, lastMarketCap: true, sharesOutstanding: true }
    });

    const latestValuation = !tickerData?.lastPrice ? await prisma.dailyValuationHistory.findFirst({
        where: { symbol },
        orderBy: { date: 'desc' }
    }) : null;

    const currentPrice = tickerData?.lastPrice || latestValuation?.closePrice || 0;
    const marketCap = tickerData?.lastMarketCap || latestValuation?.marketCap || (tickerData?.sharesOutstanding && currentPrice ? tickerData.sharesOutstanding * currentPrice : 0);

    // --- Altman Z-Score ---
    let altmanZ: number | null = null;
    if (latestStmt.totalAssets && latestStmt.totalAssets > 0) {
        const sharesOutstanding = latestStmt.sharesOutstanding || tickerData?.sharesOutstanding;
        const marketValueOfEquity = sharesOutstanding && sharesOutstanding > 0 && currentPrice > 0
            ? sharesOutstanding * currentPrice
            : marketCap;
        
        const A = ((latestStmt.currentAssets || 0) - (latestStmt.currentLiabilities || 0)) / latestStmt.totalAssets;
        const B = (latestStmt.retainedEarnings || 0) / latestStmt.totalAssets;
        const C = (latestStmt.ebit || 0) / latestStmt.totalAssets;
        const D = latestStmt.totalLiabilities && latestStmt.totalLiabilities > 0 && marketValueOfEquity > 0 
            ? marketValueOfEquity / latestStmt.totalLiabilities 
            : 0;
        const E = (latestStmt.revenue || 0) / latestStmt.totalAssets;
        altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
    }

    // --- FCF & Debt Repayment ---
    let fcf: number | null = null;
    let debtRepaymentYears: number | null = null;
    let humanDebtInfo: string | null = null;

    if (ttmOcf !== null && ttmCapex !== null) {
        fcf = ttmOcf - Math.abs(ttmCapex);
        const netDebt = (latestStmt.totalDebt || 0) - (latestStmt.cashAndEquivalents || 0);

        if (netDebt <= 0) {
            debtRepaymentYears = 0;
            humanDebtInfo = "Spoločnosť je po očistení o hotovosť prakticky bez dlhu.";
        } else if (fcf > 0) {
            debtRepaymentYears = netDebt / fcf;
            humanDebtInfo = `Firma potrebuje približne ${debtRepaymentYears.toFixed(1)} roka na splatenie čistého dlhu z voľného cash flow.`;
        } else {
            humanDebtInfo = "Spoločnosť má záporné FCF, čo sťažuje splácanie dlhu z vlastných operácií.";
        }
    }

    let fcfMargin: number | null = null;
    if (fcf !== null && latestStmt.revenue && latestStmt.revenue > 0) {
        fcfMargin = fcf / (ttmRevenue ?? latestStmt.revenue);
    }

    let fcfConversion: number | null = null;
    if (fcf !== null && latestStmt.netIncome && latestStmt.netIncome > 0) {
        fcfConversion = fcf / (ttmNetIncome ?? latestStmt.netIncome);
    }

    // --- Quality Stats ---
    let negativeNiYears = 0;
    const margins: number[] = [];
    const yearlyNi: Record<number, number> = {};
    stmts.forEach(s => {
        if (s.netIncome !== null) {
            yearlyNi[s.fiscalYear] = (yearlyNi[s.fiscalYear] || 0) + s.netIncome;
        }
        if (s.revenue && s.revenue > 0 && s.ebit !== null) {
            margins.push(s.ebit / s.revenue);
        }
    });
    Object.values(yearlyNi).forEach(ni => { if (ni < 0) negativeNiYears++; });

    let marginStability: number | null = null;
    if (margins.length > 2) {
        const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / margins.length;
        marginStability = Math.sqrt(variance);
    }

    // --- Interest Coverage ---
    let interestCoverage: number | null = null;
    if (latestStmt.ebit !== null && latestStmt.interestExpense !== null && latestStmt.interestExpense !== 0) {
        interestCoverage = latestStmt.ebit / Math.abs(latestStmt.interestExpense);
    }

    // ─── HEALTH SCORE (0-100, 4 × 25pts) ────────────────────────────────
    healthScore = 0;

    if (altmanZ !== null) {
        if (altmanZ > 3.0) healthScore += 25;
        else if (altmanZ >= 2.0) healthScore += 18;
        else if (altmanZ >= 1.5) healthScore += 10;
        else healthScore += 3;
    }

    if (latestStmt.currentAssets && latestStmt.currentLiabilities && latestStmt.currentLiabilities > 0) {
        const cr = latestStmt.currentAssets / latestStmt.currentLiabilities;
        if (cr >= 2.0) healthScore += 25;
        else if (cr >= 1.5) healthScore += 18;
        else if (cr >= 1.0) healthScore += 12;
        else if (cr >= 0.7) healthScore += 6;
    }

    if (interestCoverage !== null) {
        if (interestCoverage > 10) healthScore += 25;
        else if (interestCoverage > 5)  healthScore += 18;
        else if (interestCoverage > 2)  healthScore += 10;
        else if (interestCoverage > 0)  healthScore += 3;
    } else {
        healthScore += 25;
    }

    const currentNetDebt = (latestStmt.totalDebt || 0) - (latestStmt.cashAndEquivalents || 0);
    if (latestStmt.totalDebt !== null || latestStmt.cashAndEquivalents !== null) {
        if (currentNetDebt <= 0) {
            healthScore += 25;
        } else if (latestStmt.totalAssets && latestStmt.totalAssets > 0) {
            const debtRatio = currentNetDebt / latestStmt.totalAssets;
            if (debtRatio < 0.10) healthScore += 20;
            else if (debtRatio < 0.30) healthScore += 12;
            else if (debtRatio < 0.50) healthScore += 5;
        }
    }

    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    // ─── PROFITABILITY SCORE (0-100, 4 × 25pts) ─────────────────────────
    profitabilityScore = 0;

    if (latestStmt.revenue && latestStmt.revenue > 0) {
        const netMargin = (latestStmt.netIncome || 0) / latestStmt.revenue;
        if (netMargin > 0.20)       profitabilityScore += 25;
        else if (netMargin > 0.10)  profitabilityScore += 20;
        else if (netMargin > 0.05)  profitabilityScore += 13;
        else if (netMargin > 0)     profitabilityScore += 6;

        if (latestStmt.grossProfit !== null) {
            const grossMargin = latestStmt.grossProfit / latestStmt.revenue;
            if (grossMargin > 0.60)      profitabilityScore += 25;
            else if (grossMargin > 0.40) profitabilityScore += 20;
            else if (grossMargin > 0.25) profitabilityScore += 12;
            else if (grossMargin > 0.10) profitabilityScore += 5;
        }

        if (latestStmt.totalEquity && latestStmt.totalEquity > 0) {
            const roe = (latestStmt.netIncome || 0) / latestStmt.totalEquity;
            if (roe > 0.25)      profitabilityScore += 25;
            else if (roe > 0.15) profitabilityScore += 20;
            else if (roe > 0.08) profitabilityScore += 12;
            else if (roe > 0)    profitabilityScore += 5;
        }

        const prevYearStmt = stmts.find(s =>
            s.fiscalPeriod === latestStmt.fiscalPeriod &&
            s.fiscalYear === latestStmt.fiscalYear - 1
        ) || null;
        if (prevYearStmt?.revenue && prevYearStmt.revenue > 0) {
            const revenueGrowth = (latestStmt.revenue - prevYearStmt.revenue) / prevYearStmt.revenue;
            if (revenueGrowth > 0.25)       profitabilityScore += 25;
            else if (revenueGrowth > 0.10)  profitabilityScore += 20;
            else if (revenueGrowth > 0)     profitabilityScore += 12;
            else if (revenueGrowth > -0.10) profitabilityScore += 4;
        } else {
            profitabilityScore += 10;
        }
    }

    profitabilityScore = Math.max(0, Math.min(100, Math.round(profitabilityScore)));

    // ─── VALUATION SCORE (0-100, 4 × 25pts) ────────────────────────
    valuationScore = 0;
    let humanPeInfo: string | null = null;

    const allValuations = await prisma.dailyValuationHistory.findMany({
        where: { symbol, peRatio: { not: null } },
        select: { peRatio: true },
        orderBy: { peRatio: 'asc' }
    });

    const effectiveNetIncome = ttmNetIncome ?? latestStmt.netIncome;
    const currentPE = (currentPrice > 0 && latestStmt.sharesOutstanding && effectiveNetIncome && effectiveNetIncome > 0)
        ? (currentPrice * latestStmt.sharesOutstanding) / effectiveNetIncome
        : (latestValuation?.peRatio || null);

    if (allValuations.length > 0 && currentPE !== null && currentPE > 0) {
        const index = allValuations.findIndex(v => v.peRatio !== null && v.peRatio >= currentPE);
        const percentile = index === -1 ? 100 : (index / allValuations.length) * 100;
        if (percentile < 20)      valuationScore += 25;
        else if (percentile < 40) valuationScore += 20;
        else if (percentile < 60) valuationScore += 12;
        else if (percentile < 80) valuationScore += 5;
        humanPeInfo = `Aktuálne P/E je v ${percentile > 50 ? 'horných' : 'dolných'} ${percentile > 50 ? (100 - percentile).toFixed(0) : percentile.toFixed(0)}% historických hodnôt.`;
    } else if (currentPE === null) {
        valuationScore += 10;
    }

    if (fcf !== null && marketCap > 0) {
        const currentFcfYield = fcf / marketCap;
        if (currentFcfYield > 0.08)      valuationScore += 25;
        else if (currentFcfYield > 0.05) valuationScore += 20;
        else if (currentFcfYield > 0.03) valuationScore += 12;
        else if (currentFcfYield > 0)    valuationScore += 5;
    } else {
        valuationScore += 10;
    }

    const effectiveRevenue = ttmRevenue ?? latestStmt.revenue;
    if (effectiveRevenue && effectiveRevenue > 0 && marketCap > 0) {
        const ps = marketCap / effectiveRevenue;
        if (ps < 2)       valuationScore += 25;
        else if (ps < 5)  valuationScore += 20;
        else if (ps < 10) valuationScore += 12;
        else if (ps < 20) valuationScore += 5;
    } else {
        valuationScore += 10;
    }

    const effectiveEbit = ttmEbit ?? latestStmt.ebit;
    if (effectiveEbit && effectiveEbit > 0 && marketCap > 0) {
        const ev = marketCap + (latestStmt.totalDebt || 0) - (latestStmt.cashAndEquivalents || 0);
        const evToEbit = ev / effectiveEbit;
        if (evToEbit < 10)      valuationScore += 25;
        else if (evToEbit < 15) valuationScore += 20;
        else if (evToEbit < 25) valuationScore += 12;
        else if (evToEbit < 40) valuationScore += 5;
    } else {
        valuationScore += 10;
    }

    valuationScore = Math.max(0, Math.min(100, Math.round(valuationScore)));

    // ─── CAGR, Piotroski, Beneish ──────────────────────────────────
    let revenueCagr: number | null = null;
    let netIncomeCagr: number | null = null;
    const latestAnnual = annualStmts[0] || null;
    const stmt5yAgoAnnual = annualStmts[4] || annualStmts[annualStmts.length - 1] || null;
    const yearsBack = annualStmts.length >= 5 ? 4 : (annualStmts.length - 1);
    
    if (latestAnnual && stmt5yAgoAnnual && yearsBack > 0) {
        if (latestAnnual.revenue && stmt5yAgoAnnual.revenue && stmt5yAgoAnnual.revenue > 0) {
            revenueCagr = (Math.pow(latestAnnual.revenue / stmt5yAgoAnnual.revenue, 1 / yearsBack) - 1) * 100;
        }
        if (latestAnnual.netIncome && stmt5yAgoAnnual.netIncome && stmt5yAgoAnnual.netIncome > 0 && latestAnnual.netIncome > 0) {
            netIncomeCagr = (Math.pow(latestAnnual.netIncome / stmt5yAgoAnnual.netIncome, 1 / yearsBack) - 1) * 100;
        }
    }

    let piotroskiScore = 0;
    const prevAnnual = annualStmts[1] || null;
    if (latestAnnual && prevAnnual) {
        const lA = latestAnnual;
        const pA = prevAnnual;
        const totalAssets = lA.totalAssets || 1;
        const prevTotalAssets = pA.totalAssets || 1;
        const avgTotalAssets = (totalAssets + prevTotalAssets) / 2;
        const roa = (lA.netIncome || 0) / avgTotalAssets;
        const prevRoa = (pA.netIncome || 0) / prevTotalAssets;
        const cfo = (lA.operatingCashFlow || 0) / avgTotalAssets;
        if (roa > 0) piotroskiScore += 1;
        if (lA.operatingCashFlow && lA.operatingCashFlow > 0) piotroskiScore += 1;
        if (roa > prevRoa) piotroskiScore += 1;
        if (cfo > roa) piotroskiScore += 1;

        const leverage = lA.totalDebt && avgTotalAssets > 0 ? lA.totalDebt / avgTotalAssets : 0;
        const prevLeverage = pA.totalDebt && prevTotalAssets > 0 ? pA.totalDebt / prevTotalAssets : 0;
        const currRatio = lA.currentAssets && lA.currentLiabilities ? lA.currentAssets / lA.currentLiabilities : 0;
        const prevCurrRatio = pA.currentAssets && pA.currentLiabilities ? pA.currentAssets / pA.currentLiabilities : 0;
        if (leverage < prevLeverage) piotroskiScore += 1;
        if (currRatio > prevCurrRatio) piotroskiScore += 1;
        if ((lA.sharesOutstanding || 0) <= (pA.sharesOutstanding || 0)) piotroskiScore += 1;

        const gm = lA.revenue ? (lA.grossProfit || 0) / lA.revenue : 0;
        const prevGm = pA.revenue ? (pA.grossProfit || 0) / pA.revenue : 0;
        const at = lA.revenue ? lA.revenue / avgTotalAssets : 0;
        const prevAt = pA.revenue ? pA.revenue / prevTotalAssets : 0;
        if (gm > prevGm) piotroskiScore += 1;
        if (at > prevAt) piotroskiScore += 1;
    }

    let beneishScore: number | null = null;
    if (latestAnnual && prevAnnual && latestAnnual.revenue && prevAnnual.revenue && prevAnnual.revenue > 0) {
        const lA = latestAnnual;
        const pA = prevAnnual;
        const lTA = lA.totalAssets || 1;
        const pTA = pA.totalAssets || 1;
        const lRev = lA.revenue!;
        const pRev = pA.revenue!;

        // Days Sales in Receivables Index
        const dsri = ((lA.currentAssets || 0) / lRev) / ((pA.currentAssets || 0) / pRev);
        // Gross Margin Index (higher = worse, i.e. margins deteriorating)
        const gmIndex = ((pA.grossProfit || 0) / pRev) / ((lA.grossProfit || 0) / lRev);
        // Asset Quality Index (non-current assets excluding PPE as proportion of total assets)
        const lNonCurrentNonPPE = Math.max(0, (lTA - (lA.currentAssets || 0)) - (lA.netPPE || 0));
        const pNonCurrentNonPPE = Math.max(0, (pTA - (pA.currentAssets || 0)) - (pA.netPPE || 0));
        const aqi = (lNonCurrentNonPPE / lTA) / (pNonCurrentNonPPE / pTA || 1);
        // Sales Growth Index
        const sgi = lRev / pRev;
        // Depreciation Index (higher = worse — decreasing depreciation relative to assets)
        const depi = ((pA.netPPE || 0) / ((pA.netPPE || 0) + (lA.netPPE || 0))) / (((pA.netPPE || 0) + (lA.netPPE || 0)) / (lTA + pTA));
        // SG&A Expense Index (SGA as % of sales — higher = worse)
        const sgai = ((pA.grossProfit || 0) - (pA.ebit || 0)) / pRev / (((lA.grossProfit || 0) - (lA.ebit || 0)) / lRev || 1);
        // Leverage Index (debt-to-assets — higher = worse)
        const lvgi = ((lA.totalDebt || 0) / lTA) / ((pA.totalDebt || 0) / pTA || 1);
        // Total Accruals to Total Assets
        const tata = ((lA.netIncome || 0) - (lA.operatingCashFlow || 0)) / lTA;

        beneishScore = -4.84
            + 0.92 * (isFinite(dsri) ? dsri : 1)
            + 0.528 * (isFinite(gmIndex) ? gmIndex : 1)
            + 0.404 * (isFinite(aqi) ? aqi : 1)
            + 0.892 * (isFinite(sgi) ? sgi : 1)
            + 0.115 * (isFinite(depi) ? depi : 1)
            - 0.173 * (isFinite(sgai) ? sgai : 1)
            + 0.352 * (isFinite(lvgi) ? lvgi : 1)
            - 0.44 * (isFinite(tata) ? tata : 0);
    }

    // ─── AI Verdict ────────────────────────────────────────────────
    try {
        const aiVerdict = await aiService.generateInvestmentVerdict({
            ticker: symbol,
            scores: { H: healthScore, P: profitabilityScore, V: valuationScore },
            context: `Altman Z: ${altmanZ?.toFixed(2)}, Repayment: ${debtRepaymentYears?.toFixed(1)}y, FCF Yield: ${fcf && marketCap ? (fcf / marketCap * 100).toFixed(1) : 'N/A'}%`
        });
        if (aiVerdict) verdictText = aiVerdict;
    } catch (e) { }

    // ─── Signal Detection & Notification ───────────────────────────
    let lastQualitySignalAt: Date | undefined;
    if (altmanZ !== null && altmanZ > 3.0 && healthScore > 80) {
        const existingCache: any = await (prisma.analysisCache as any).findUnique({
            where: { symbol },
            select: { lastQualitySignalAt: true }
        });
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        if (!existingCache?.lastQualitySignalAt || existingCache.lastQualitySignalAt < sevenDaysAgo) {
            lastQualitySignalAt = new Date();
            NotificationService.notifyQualityBreakout(symbol, {
                health: healthScore,
                altmanZ: altmanZ
            }).catch(err => console.error(`[Alert] Notification failed for ${symbol}:`, err));
        }
    }

    await (prisma.analysisCache as any).upsert({
        where: { symbol },
        update: {
            healthScore, profitabilityScore, valuationScore, verdictText,
            piotroskiScore, beneishScore, interestCoverage, revenueCagr, netIncomeCagr,
            altmanZ, debtRepaymentYears, fcfMargin, fcfConversion,
            humanDebtInfo, humanPeInfo, marginStability, negativeNiYears,
            ...(lastQualitySignalAt ? { lastQualitySignalAt } : {})
        },
        create: {
            symbol, healthScore, profitabilityScore, valuationScore, verdictText,
            piotroskiScore, beneishScore, interestCoverage, revenueCagr, netIncomeCagr,
            altmanZ, debtRepaymentYears, fcfMargin, fcfConversion,
            humanDebtInfo, humanPeInfo, marginStability, negativeNiYears,
            lastQualitySignalAt
        }
    });
}
