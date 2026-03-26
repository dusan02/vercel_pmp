import { prisma } from '@/lib/db/prisma';
import { aiService } from './aiService';
import { NotificationService } from './notificationService';
import { getSectorFromSic } from '@/lib/utils/sectorMapping';

export class AnalysisService {
    private static readonly POLYGON_API_KEY = process.env.POLYGON_API_KEY;

    /**
     * 1. Sťahovanie a mapovanie Financials vX z Polygon.io (nástupca v3)
     */
    static async syncFinancials(symbol: string): Promise<void> {
        if (!this.POLYGON_API_KEY) throw new Error('Chýba Polygon API Key');

        const timeframes = ['quarterly', 'annual'];

        try {
            for (const timeframe of timeframes) {
                const url = `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&timeframe=${timeframe}&limit=100&apiKey=${this.POLYGON_API_KEY}`;
                
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Polygon API chyba: ${response.status} ${response.statusText}`);

                const data = await response.json();
                const results = data.results || [];

                // Helper function to extract value robustly since polygon can omit fields
                const getValue = (source: any, key: string): number | null => source?.[key]?.value ?? null;

            for (const item of results) {
                const { start_date, end_date, fiscal_period, fiscal_year, financials } = item;
                const inc = financials?.income_statement || {};
                const bs = financials?.balance_sheet || {};
                const cf = financials?.cash_flow_statement || {};

                if (!end_date || !fiscal_period || !fiscal_year) continue;

                const parsedFiscalYear = parseInt(fiscal_year, 10);
                if (isNaN(parsedFiscalYear)) continue;

                // Determine final period string (e.g. if the API returns timeframe=annual it's 'FY' or 'TTM' sometimes)
                const finalPeriod = timeframe === 'annual' ? 'FY' : fiscal_period;

                await prisma.financialStatement.upsert({
                    where: {
                        symbol_fiscalYear_fiscalPeriod: {
                            symbol,
                            fiscalYear: parsedFiscalYear,
                            fiscalPeriod: finalPeriod,
                        }
                    },
                    update: {
                        endDate: new Date(end_date),
                        revenue: getValue(inc, 'revenues'),
                        netIncome: getValue(inc, 'net_income_loss'),
                        ebit: getValue(inc, 'operating_income_loss') ?? getValue(inc, 'operating_income'),
                        operatingCashFlow: getValue(cf, 'net_cash_flow_from_operating_activities'),
                        capex: getValue(cf, 'net_cash_flow_from_investing_activities_property_plant_and_equipment') ?? 
                               getValue(cf, 'capital_expenditure_and_intangible_assets') ??
                               getValue(cf, 'capital_expenditures') ??
                               getValue(cf, 'payments_for_acquisition_of_property_plant_and_equipment'),
                        totalAssets: getValue(bs, 'assets'),
                        totalLiabilities: getValue(bs, 'liabilities'),
                        currentAssets: getValue(bs, 'current_assets'),
                        currentLiabilities: getValue(bs, 'current_liabilities'),
                        retainedEarnings: getValue(bs, 'retained_earnings'),
                        totalEquity: getValue(bs, 'equity') ?? getValue(bs, 'stockholders_equity'),
                        sharesOutstanding: getValue(inc, 'basic_average_shares') ?? 
                                     getValue(inc, 'diluted_average_shares') ??
                                     getValue(inc, 'weighted_average_shares_outstanding'),
                        sbc: getValue(cf, 'share_based_compensation'),
                        interestExpense: getValue(inc, 'interest_expense_operating') ?? getValue(inc, 'interest_expense'),
                        totalDebt: getValue(bs, 'long_term_debt') ?? getValue(bs, 'debt') ?? getValue(bs, 'current_and_non_current_debt'),
                        cashAndEquivalents: getValue(bs, 'cash_and_cash_equivalents') ?? getValue(bs, 'cash'),
                        grossProfit: getValue(inc, 'gross_profit'),
                        netPPE: getValue(bs, 'property_plant_and_equipment_net')
                    } as any, // Temporary cast to bypass stale client types
                    create: {
                        symbol,
                        period: finalPeriod,
                        endDate: new Date(end_date),
                        fiscalYear: parsedFiscalYear,
                        fiscalPeriod: finalPeriod,
                        revenue: getValue(inc, 'revenues'),
                        netIncome: getValue(inc, 'net_income_loss'),
                        ebit: getValue(inc, 'operating_income_loss') ?? getValue(inc, 'operating_income'),
                        operatingCashFlow: getValue(cf, 'net_cash_flow_from_operating_activities'),
                        capex: getValue(cf, 'net_cash_flow_from_investing_activities_property_plant_and_equipment') ?? 
                               getValue(cf, 'capital_expenditure_and_intangible_assets') ??
                               getValue(cf, 'capital_expenditures') ??
                               getValue(cf, 'payments_for_acquisition_of_property_plant_and_equipment'),
                        totalAssets: getValue(bs, 'assets'),
                        totalLiabilities: getValue(bs, 'liabilities'),
                        currentAssets: getValue(bs, 'current_assets'),
                        currentLiabilities: getValue(bs, 'current_liabilities'),
                        retainedEarnings: getValue(bs, 'retained_earnings'),
                        totalEquity: getValue(bs, 'equity') ?? getValue(bs, 'stockholders_equity'),
                        sharesOutstanding: getValue(inc, 'basic_average_shares') ?? 
                                     getValue(inc, 'diluted_average_shares') ??
                                     getValue(inc, 'weighted_average_shares_outstanding'),
                        sbc: getValue(cf, 'share_based_compensation'),
                        interestExpense: getValue(inc, 'interest_expense_operating') ?? getValue(inc, 'interest_expense'),
                        totalDebt: getValue(bs, 'long_term_debt') ?? getValue(bs, 'debt') ?? getValue(bs, 'current_and_non_current_debt'),
                        cashAndEquivalents: getValue(bs, 'cash_and_cash_equivalents') ?? getValue(bs, 'cash'),
                        grossProfit: getValue(inc, 'gross_profit'),
                        netPPE: getValue(bs, 'property_plant_and_equipment_net')
                    } as any
                });
            }
        }
        } catch (error) {
            console.error(`Error syncing financials for ${symbol}:`, error);
            throw error;
        }
    }

    /**
     * 2. Sťahovanie detailov spoločnosti (popis, web, logo) z Polygon V3
     *
     * Field mapping fixes:
     *  - total_employees (Polygon V3 field name, NOT employees)
     *  - sic_description → industry (human-readable, e.g. "Semiconductors")
     *  - sector: only set if blank in DB (don't overwrite bootstrap value)
     *  - After sync: if lastPrice or lastMarketCap is null, compute from prev-day aggs
     */
    static async syncTickerDetails(symbol: string): Promise<void> {
        if (!this.POLYGON_API_KEY) throw new Error('Chýba Polygon API Key');

        const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${this.POLYGON_API_KEY}`;

        try {
            const response = await fetch(url);
            if (!response.ok) return; // Silently fail if ticker details not found

            const data = await response.json();
            const res = data.results;
            if (!res) return;

            // Fetch existing ticker so we don't clobber a well-set sector
            const existing = await prisma.ticker.findUnique({
                where: { symbol },
                select: { sector: true, lastPrice: true, lastMarketCap: true, sharesOutstanding: true }
            });

            const sharesOutstanding = res.weighted_shares_outstanding || res.share_class_shares_outstanding || null;

            const updateData: Record<string, any> = {
                description: res.description || null,
                // Polygon V3 uses total_employees, NOT employees
                employees: res.total_employees || null,
                websiteUrl: res.homepage_url || null,
                // sic_description is the human-readable industry name (e.g. "Semiconductors and Related Devices")
                industry: res.sic_description || (res.sic_code ? `SIC: ${res.sic_code}` : null),
                name: res.name || undefined,
                sharesOutstanding: sharesOutstanding && sharesOutstanding > 0 ? sharesOutstanding : undefined
            };

            const standardSectors = [
                'Technology', 'Financial Services', 'Healthcare', 'Consumer Cyclical',
                'Consumer Defensive', 'Energy', 'Utilities', 'Industrials',
                'Basic Materials', 'Real Estate', 'Communication Services'
            ];

            const sectorFromSic = getSectorFromSic(res.sic_code);

            // Update sector if it's missing, 'Other', 'Unknown', or not in the standard list
            const isWeakSector = !existing?.sector || 
                                existing.sector === 'Other' || 
                                existing.sector === 'N/A' || 
                                existing.sector === 'Unknown' ||
                                !standardSectors.includes(existing.sector);
            
            const isRedundantSector = existing?.sector === res.sic_description;
            
            if (isWeakSector || isRedundantSector) {
                updateData.sector = sectorFromSic || res.sic_description || 'Other';
            }

            await prisma.ticker.upsert({
                where: { symbol },
                create: {
                    symbol,
                    ...updateData,
                    sector: updateData.sector || res.sic_description || null,
                    sharesOutstanding: sharesOutstanding && sharesOutstanding > 0 ? sharesOutstanding : 0
                },
                update: updateData
            });

            // ── Fallback: populate lastPrice / lastMarketCap from yesterday's aggregates ──
            // This ensures the Analysis Hero card shows price & market cap even if the
            // snapshot worker hasn't processed this ticker yet.
            const needsPrice = !existing?.lastPrice || existing.lastPrice <= 0;
            const needsMarketCap = !existing?.lastMarketCap || existing.lastMarketCap <= 0;

            if (needsPrice || needsMarketCap) {
                try {
                    const aggsUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${this.POLYGON_API_KEY}`;
                    const aggsRes = await fetch(aggsUrl);
                    if (aggsRes.ok) {
                        const aggsData = await aggsRes.json();
                        const prevClose: number | null = aggsData?.results?.[0]?.c ?? null;

                        if (prevClose && prevClose > 0) {
                            const sharesOutstanding: number | null =
                                existing?.sharesOutstanding ??
                                (res.weighted_shares_outstanding || res.share_class_shares_outstanding || null);

                            const computedMarketCap = sharesOutstanding && sharesOutstanding > 0
                ? (prevClose * sharesOutstanding) / 1_000_000_000 // Convert to Billions
                : null;

                            const priceUpdate: Record<string, any> = {};
                            if (needsPrice) priceUpdate.lastPrice = prevClose;
                            if (needsMarketCap && computedMarketCap) priceUpdate.lastMarketCap = computedMarketCap;

                            if (Object.keys(priceUpdate).length > 0) {
                                await prisma.ticker.update({ where: { symbol }, data: priceUpdate });
                                console.log(`[syncTickerDetails] ${symbol}: fallback price=${prevClose} marketCap=${computedMarketCap}`);
                            }
                        }
                    }
                } catch (aggsError) {
                    console.warn(`[syncTickerDetails] ${symbol}: failed to fetch prev aggs:`, aggsError);
                }
            }
        } catch (error) {
            console.error(`Error syncing ticker details for ${symbol}:`, error);
        }
    }

    /**
     * 3. Sťahovanie a výpočet dennej valuačnej histórie
     * Note: Odporúčanie (Lazy load): Toto trvá dlho na volania API,
     * takže volať buď v pozadí (cron batch) alebo lazy keď si to používateľ otvorí prvýkrát.
     */
    static async syncValuationHistory(symbol: string): Promise<void> {
        if (!this.POLYGON_API_KEY) throw new Error('Chýba Polygon API Key');

        // 10 years ago to today
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setFullYear(toDate.getFullYear() - 10);

        const fromStr = fromDate.toISOString().split('T')[0];
        const toStr = toDate.toISOString().split('T')[0];

        // Aggs API for daily prices
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}?apiKey=${this.POLYGON_API_KEY}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Polygon API chyba: ${response.statusText}`);

            const data = await response.json();
            const aggs = data.results || [];

            if (aggs.length === 0) {
                console.warn(`No price history found for ${symbol} in Polygon.`);
                return;
            }

            // Load all local statements to map against price dates
            const statements = await prisma.financialStatement.findMany({
                where: { symbol },
                orderBy: { endDate: 'desc' },
            });

            if (statements.length === 0) {
                console.warn(`No financials available for ${symbol}, can't calculate complete multiples.`);
            }

            const transactions = [];

            for (const agg of aggs) {
                const date = new Date(agg.t);
                const closePrice = agg.c;

                let peRatio = null;
                let psRatio = null;
                let marketCap = null;
                let evEbitda = null;
                let fcfYield = null;

                // Najdi najbližší posledný kvartál pred (alebo v deň) tohto dátumu
                const stmt = statements.find(s => s.endDate.getTime() <= date.getTime()) || statements[statements.length - 1];

                if (stmt && stmt.sharesOutstanding) {
                    marketCap = closePrice * stmt.sharesOutstanding;

                    // P/E = Price / (NetIncome / Shares) => closePrice / EPS
                    if (stmt.netIncome && stmt.netIncome > 0) {
                        peRatio = closePrice / (stmt.netIncome / stmt.sharesOutstanding);
                    }

                    // P/S = Price / (Revenue / Shares) => closePrice / SPS
                    if (stmt.revenue && stmt.revenue > 0) {
                        psRatio = closePrice / (stmt.revenue / stmt.sharesOutstanding);
                    }

                    // EV/EBITDA
                    // EV = Market Cap + Total Debt - Cash
                    if (stmt.ebit && stmt.ebit > 0 && stmt.totalDebt !== null && stmt.cashAndEquivalents !== null) {
                        const ev = marketCap + stmt.totalDebt - stmt.cashAndEquivalents;
                        evEbitda = ev / stmt.ebit;
                    }

                    // FCF Yield = FCF / MarketCap
                    // FCF = Operating Cash Flow - Capex
                    // Pozor: v accountingu býva capex ako záporné číslo (úbytok cashflow z investičných aktivít).
                    // Ak je capex záporný v dátach, matematicky spravíme - absolute value, aby sme dostali FCF = OCF - Capex
                    if (stmt.operatingCashFlow !== null && stmt.capex !== null && marketCap > 0) {
                        const fcf = stmt.operatingCashFlow - Math.abs(stmt.capex);
                        fcfYield = fcf / marketCap;
                    }
                }

                transactions.push(
                    prisma.dailyValuationHistory.upsert({
                        where: { symbol_date: { symbol, date } },
                        update: { closePrice, marketCap, peRatio, psRatio, evEbitda, fcfYield },
                        create: { symbol, date, closePrice, marketCap, peRatio, psRatio, evEbitda, fcfYield }
                    })
                );
            }

            // Batch inserts po 500 riadkoch (celkovo bude cca 2500)
            const chunkSize = 500;
            for (let i = 0; i < transactions.length; i += chunkSize) {
                await prisma.$transaction(transactions.slice(i, i + chunkSize));
            }

        } catch (error) {
            console.error(`Error syncing valuation history for ${symbol}:`, error);
            throw error;
        }
    }

    /**
     * 3. Analytické výpočty, skóre a verdict
     */
    static async calculateScores(symbol: string): Promise<void> {
        const stmts = await prisma.financialStatement.findMany({
            where: { symbol },
            orderBy: { endDate: 'desc' },
            take: 40 // Up to 10 years of quarterly data
        });

        const latestStmt = stmts[0];
        if (!latestStmt) return;
        const prevStmt = stmts[1] || null;
        const stmt5yAgo = stmts[19] || stmts[stmts.length - 1] || null;

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

        // --- NEW METRICS ---
        let altmanZ: number | null = null;
        if (latestStmt.totalAssets && latestStmt.totalAssets > 0) {
            // Správny výpočet Market Value of Equity = Shares Outstanding × Current Price
            // Prioritizuj sharesOutstanding z financial statement (presnejšie)
            const sharesOutstanding = latestStmt.sharesOutstanding || tickerData?.sharesOutstanding;
            const marketValueOfEquity = sharesOutstanding && sharesOutstanding > 0 && currentPrice > 0
                ? sharesOutstanding * currentPrice
                : marketCap; // Fallback na marketCap z tickeru
            
            const A = ((latestStmt.currentAssets || 0) - (latestStmt.currentLiabilities || 0)) / latestStmt.totalAssets;
            const B = (latestStmt.retainedEarnings || 0) / latestStmt.totalAssets;
            const C = (latestStmt.ebit || 0) / latestStmt.totalAssets;
            const D = latestStmt.totalLiabilities && latestStmt.totalLiabilities > 0 && marketValueOfEquity > 0 
                ? marketValueOfEquity / latestStmt.totalLiabilities 
                : 0;
            const E = (latestStmt.revenue || 0) / latestStmt.totalAssets;
            altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
        }

        let fcf: number | null = null;
        let debtRepaymentYears: number | null = null;
        let humanDebtInfo: string | null = null;

        if (latestStmt.operatingCashFlow !== null && latestStmt.capex !== null) {
            fcf = latestStmt.operatingCashFlow - Math.abs(latestStmt.capex);
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
            fcfMargin = fcf / latestStmt.revenue;
        }

        let fcfConversion: number | null = null;
        if (fcf !== null && latestStmt.netIncome && latestStmt.netIncome > 0) {
            fcfConversion = fcf / latestStmt.netIncome;
        }

        // Quality Stats
        let negativeNiYears = 0;
        const margins: number[] = [];
        // Group by year to count negative years
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

        // Health Score
        if (altmanZ !== null) {
            if (altmanZ > 3.0) healthScore += 30;
            else if (altmanZ < 1.8) healthScore -= 30;
        }
        if (debtRepaymentYears !== null) {
            if (debtRepaymentYears < 3) healthScore += 20;
            if (debtRepaymentYears > 10) healthScore -= 20;
        }
        healthScore = Math.max(0, Math.min(100, healthScore));

        // Profitability
        if (latestStmt.revenue && latestStmt.revenue > 0) {
            let pScore = 50;
            const netMargin = (latestStmt.netIncome || 0) / latestStmt.revenue;
            if (netMargin > 0.15) pScore += 15;
            else if (netMargin < 0) pScore -= 15;

            if (latestStmt.ebit && prevStmt?.revenue && prevStmt.ebit) {
                const currentOpMargin = latestStmt.ebit / latestStmt.revenue;
                const prevOpMargin = prevStmt.ebit / prevStmt.revenue;
                if (currentOpMargin > prevOpMargin) pScore += 10;
                else pScore -= 10;
            }
            if (latestStmt.totalEquity && latestStmt.totalEquity > 0) {
                const roe = (latestStmt.netIncome || 0) / latestStmt.totalEquity;
                if (roe > 0.15) pScore += 15;
                else if (roe < 0.05) pScore -= 10;
            }
            profitabilityScore = Math.max(0, Math.min(100, Math.round(pScore)));
        }

        // Valuation & PE Percentile
        let humanPeInfo: string | null = null;
        const allValuations = await prisma.dailyValuationHistory.findMany({
            where: { symbol, peRatio: { not: null } },
            select: { peRatio: true },
            orderBy: { peRatio: 'asc' }
        });

        if (allValuations.length > 0) {
            let vScore = 50;
            const currentPE = tickerData?.lastPrice && latestStmt.sharesOutstanding && latestStmt.netIncome && latestStmt.netIncome > 0
                ? (tickerData.lastPrice * latestStmt.sharesOutstanding) / latestStmt.netIncome
                : (latestValuation?.peRatio || null);

            if (currentPE !== null && currentPE > 0) {
                const index = allValuations.findIndex(v => v.peRatio !== null && v.peRatio >= currentPE);
                const percentile = index === -1 ? 100 : (index / allValuations.length) * 100;
                vScore += (50 - percentile) / 2;
                humanPeInfo = `Aktuálne P/E je v ${percentile > 50 ? 'horných' : 'dolných'} ${percentile > 50 ? (100 - percentile).toFixed(0) : percentile.toFixed(0)}% historických hodnôt.`;
            }

            if (fcf !== null && marketCap > 0) {
                const currentFcfYield = fcf / marketCap;
                if (currentFcfYield > 0.08) vScore += 25;
                else if (currentFcfYield >= 0.04) vScore += 10;
                else if (currentFcfYield < 0.02) vScore -= 20;
            }
            valuationScore = Math.max(0, Math.min(100, Math.round(vScore)));
        }

        // Deep-Dive
        let interestCoverage: number | null = null;
        if (latestStmt.ebit !== null && latestStmt.interestExpense !== null && latestStmt.interestExpense !== 0) {
            interestCoverage = latestStmt.ebit / Math.abs(latestStmt.interestExpense);
        }

        let revenueCagr: number | null = null;
        let netIncomeCagr: number | null = null;
        const yearsBack = stmts.length >= 20 ? 5 : (stmts.length - 1) / 4;
        if (stmt5yAgo && yearsBack > 0) {
            if (latestStmt.revenue && stmt5yAgo.revenue && stmt5yAgo.revenue > 0) {
                revenueCagr = (Math.pow(latestStmt.revenue / stmt5yAgo.revenue, 1 / yearsBack) - 1) * 100;
            }
            if (latestStmt.netIncome && stmt5yAgo.netIncome && stmt5yAgo.netIncome > 0 && latestStmt.netIncome > 0) {
                netIncomeCagr = (Math.pow(latestStmt.netIncome / stmt5yAgo.netIncome, 1 / yearsBack) - 1) * 100;
            }
        }

        let piotroskiScore = 0;
        if (prevStmt) {
            const totalAssets = latestStmt.totalAssets || 1;
            const prevTotalAssets = prevStmt.totalAssets || 1;
            const roa = (latestStmt.netIncome || 0) / totalAssets;
            const prevRoa = (prevStmt.netIncome || 0) / prevTotalAssets;
            const cfo = (latestStmt.operatingCashFlow || 0) / totalAssets;
            if (roa > 0) piotroskiScore += 1;
            if (latestStmt.operatingCashFlow && latestStmt.operatingCashFlow > 0) piotroskiScore += 1;
            if (roa > prevRoa) piotroskiScore += 1;
            if (cfo > roa) piotroskiScore += 1;

            const leverage = latestStmt.totalDebt && totalAssets > 0 ? latestStmt.totalDebt / totalAssets : 0;
            const prevLeverage = prevStmt.totalDebt && prevTotalAssets > 0 ? prevStmt.totalDebt / prevTotalAssets : 0;
            const currRatio = latestStmt.currentAssets && latestStmt.currentLiabilities ? latestStmt.currentAssets / latestStmt.currentLiabilities : 0;
            const prevCurrRatio = prevStmt.currentAssets && prevStmt.currentLiabilities ? prevStmt.currentAssets / prevStmt.currentLiabilities : 0;
            if (leverage < prevLeverage) piotroskiScore += 1;
            if (currRatio > prevCurrRatio) piotroskiScore += 1;
            if ((latestStmt.sharesOutstanding || 0) <= (prevStmt.sharesOutstanding || 0)) piotroskiScore += 1;

            const gm = latestStmt.revenue ? (latestStmt.grossProfit || 0) / latestStmt.revenue : 0;
            const prevGm = prevStmt.revenue ? (prevStmt.grossProfit || 0) / prevStmt.revenue : 0;
            const at = latestStmt.revenue ? latestStmt.revenue / totalAssets : 0;
            const prevAt = prevStmt.revenue ? prevStmt.revenue / prevTotalAssets : 0;
            if (gm > prevGm) piotroskiScore += 1;
            if (at > prevAt) piotroskiScore += 1;
        }

        let beneishScore: number | null = null;
        if (prevStmt && latestStmt.revenue && prevStmt.revenue && prevStmt.revenue > 0) {
            const dsri = ((latestStmt.currentAssets || 0) / latestStmt.revenue) / ((prevStmt.currentAssets || 0) / prevStmt.revenue);
            const gmIndex = ((prevStmt.grossProfit || 0) / prevStmt.revenue) / ((latestStmt.grossProfit || 0) / latestStmt.revenue);
            const sgi = latestStmt.revenue / prevStmt.revenue;
            beneishScore = -6.065 + 0.823 * (dsri || 1) + 0.906 * (gmIndex || 1) + 0.717 * (sgi || 1);
        }

        // Verdict & Save
        try {
            const aiVerdict = await aiService.generateInvestmentVerdict({
                ticker: symbol,
                scores: { H: healthScore, P: profitabilityScore, V: valuationScore },
                context: `Altman Z: ${altmanZ?.toFixed(2)}, Repayment: ${debtRepaymentYears?.toFixed(1)}y, FCF Yield: ${fcf && marketCap ? (fcf / marketCap * 100).toFixed(1) : 'N/A'}%`
            });
            if (aiVerdict) verdictText = aiVerdict;
        } catch (e) { }

        // 📡 Signal Detection (Phase 13: Smart Alerts)
        // Check if company qualifies for "Safe & High Quality" signal
        let lastQualitySignalAt = undefined;
        if (altmanZ !== null && altmanZ > 3.0 && healthScore > 80) {
            // Fetch existing to see if it already has a signal (avoid constant timestamp updates)
            const existingCache: any = await (prisma.analysisCache as any).findUnique({
                where: { symbol },
                select: { lastQualitySignalAt: true }
            });
            // If it qualifies now but didn't have a signal or it's old (e.g. > 7 days), refresh it
            // For now, let's just set it if it meets criteria and was null or updated more than 7 days ago
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            if (!existingCache?.lastQualitySignalAt || existingCache.lastQualitySignalAt < sevenDaysAgo) {
                lastQualitySignalAt = new Date();
                // 🔔 Trigger Notification (Phase 14)
                // We'll run this in the background (no await) to avoid blocking analysis
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

    /**
     * Complete synchronization and analysis for a single ticker.
     * Useful for batch processing and cron jobs.
     */
    static async syncAndAnalyze(symbol: string): Promise<boolean> {
        try {
            await this.syncTickerDetails(symbol);
            await this.syncFinancials(symbol);
            await this.syncValuationHistory(symbol);
            await this.calculateScores(symbol);
            return true;
        } catch (error) {
            console.error(`Error in syncAndAnalyze for ${symbol}:`, error);
            return false;
        }
    }
}
