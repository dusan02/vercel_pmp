import { prisma } from '@/lib/db/prisma';
import { getSectorFromSic, toTitleCase } from '@/lib/utils/sectorMapping';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

/**
 * Sync ticker details (description, web, logo, sector, HQ) from Polygon V3.
 * Also computes fallback lastPrice/lastMarketCap from prev-day aggregates.
 */
export async function syncTickerDetails(symbol: string): Promise<void> {
    if (!POLYGON_API_KEY) throw new Error('Chýba Polygon API Key');

    const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;

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

        const hqParts = [res.address?.city, res.address?.state].filter(Boolean);
        const headquarters = hqParts.length > 0 ? hqParts.join(', ') : null;

        const updateData: Record<string, any> = {
            description: res.description || null,
            employees: res.total_employees || null,
            websiteUrl: res.homepage_url || null,
            headquarters,
            industry: res.sic_description ? toTitleCase(res.sic_description) : (res.sic_code ? `SIC: ${res.sic_code}` : null),
            name: res.name || undefined,
            sharesOutstanding: sharesOutstanding && sharesOutstanding > 0 ? sharesOutstanding : undefined
        };

        const standardSectors = [
            'Technology', 'Financial Services', 'Healthcare', 'Consumer Cyclical',
            'Consumer Defensive', 'Energy', 'Utilities', 'Industrials',
            'Basic Materials', 'Real Estate', 'Communication Services'
        ];

        const sectorFromSic = getSectorFromSic(res.sic_code);

        const isWeakSector = !existing?.sector || 
                            existing.sector === 'Other' || 
                            existing.sector === 'N/A' || 
                            existing.sector === 'Unknown' ||
                            !standardSectors.includes(existing.sector);
        
        const sicDescTitleCase = res.sic_description ? toTitleCase(res.sic_description) : null;
        const isRedundantSector = !!(res.sic_description && (
            existing?.sector === res.sic_description ||
            (sicDescTitleCase && existing?.sector === sicDescTitleCase)
        ));
        
        if (isWeakSector || isRedundantSector) {
            updateData.sector = sectorFromSic || 'Other';
        }

        await prisma.ticker.upsert({
            where: { symbol },
            create: {
                symbol,
                ...updateData,
                sector: updateData.sector || sectorFromSic || null,
                sharesOutstanding: sharesOutstanding && sharesOutstanding > 0 ? sharesOutstanding : 0
            },
            update: updateData
        });

        // ── Fallback: populate lastPrice / lastMarketCap from yesterday's aggregates ──
        const needsPrice = !existing?.lastPrice || existing.lastPrice <= 0;
        const needsMarketCap = !existing?.lastMarketCap || existing.lastMarketCap <= 0;

        if (needsPrice || needsMarketCap) {
            try {
                const aggsUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
                const aggsRes = await fetch(aggsUrl);
                if (aggsRes.ok) {
                    const aggsData = await aggsRes.json();
                    const prevClose: number | null = aggsData?.results?.[0]?.c ?? null;

                    if (prevClose && prevClose > 0) {
                        const sharesOutstanding: number | null =
                            existing?.sharesOutstanding ??
                            (res.weighted_shares_outstanding || res.share_class_shares_outstanding || null);

                        const computedMarketCap = sharesOutstanding && sharesOutstanding > 0
            ? (prevClose * sharesOutstanding) / 1_000_000_000
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
 * Sync 10Y daily valuation history (P/E, P/S, EV/EBITDA, FCF Yield) from Polygon aggs.
 * Uses incremental sync: only fetches data since last stored record.
 */
export async function syncValuationHistory(symbol: string): Promise<void> {
    if (!POLYGON_API_KEY) throw new Error('Chýba Polygon API Key');

    const toDate = new Date();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(toDate.getFullYear() - 10);

    const lastRecord = await prisma.dailyValuationHistory.findFirst({
        where: { symbol },
        orderBy: { date: 'desc' },
        select: { date: true },
    });
    const fromDate = lastRecord
        ? new Date(lastRecord.date.getTime() + 86_400_000)
        : tenYearsAgo;

    if (fromDate > toDate) {
        console.log(`[syncValuationHistory] ${symbol}: already up to date, skipping fetch.`);
        return;
    }

    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr   = toDate.toISOString().slice(0, 10);
    console.log(`[syncValuationHistory] ${symbol}: fetching ${fromStr} → ${toStr} (${lastRecord ? 'incremental' : 'full 10Y'})`);

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}?apiKey=${POLYGON_API_KEY}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Polygon API chyba: ${response.statusText}`);

        const data = await response.json();
        const aggs = data.results || [];

        if (aggs.length === 0) {
            console.warn(`No price history found for ${symbol} in Polygon.`);
            return;
        }

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

            const annualStmt = statements.find(s =>
                s.endDate.getTime() <= date.getTime() &&
                (s.fiscalPeriod === 'FY' || s.period === 'annual')
            );
            const stmt = annualStmt ||
                statements.find(s => s.endDate.getTime() <= date.getTime()) ||
                statements[statements.length - 1];

            if (stmt && stmt.sharesOutstanding) {
                marketCap = closePrice * stmt.sharesOutstanding;

                if (stmt.netIncome && stmt.netIncome > 0) {
                    peRatio = closePrice / (stmt.netIncome / stmt.sharesOutstanding);
                }

                if (stmt.revenue && stmt.revenue > 0) {
                    psRatio = closePrice / (stmt.revenue / stmt.sharesOutstanding);
                }

                if (stmt.ebit && stmt.ebit > 0 && stmt.totalDebt !== null && stmt.cashAndEquivalents !== null) {
                    const ev = marketCap + stmt.totalDebt - stmt.cashAndEquivalents;
                    evEbitda = ev / stmt.ebit;
                }

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

        const chunkSize = 500;
        for (let i = 0; i < transactions.length; i += chunkSize) {
            await prisma.$transaction(transactions.slice(i, i + chunkSize));
        }

    } catch (error) {
        console.error(`Error syncing valuation history for ${symbol}:`, error);
        throw error;
    }
}
