/**
 * Ticker Navigator ordering contract.
 *
 * Neighbors are positions in `lastMarketCap DESC, symbol ASC` order inside
 * three universes (all eligible / same sector / same industry). The mock
 * below actually evaluates the prisma where + orderBy clauses so the tests
 * verify ordering semantics, not just call shapes.
 */
import type { TickerNav } from '@/lib/analysis/tickerNav';

interface Row {
    symbol: string;
    name: string;
    lastMarketCap: number | null;
    sector: string | null;
    industry: string | null;
    hasCache: boolean;
}

const ROWS: Row[] = [
    { symbol: 'AAPL', name: 'Apple', lastMarketCap: 3800, sector: 'Technology', industry: 'Consumer Electronics', hasCache: true },
    { symbol: 'MSFT', name: 'Microsoft', lastMarketCap: 3600, sector: 'Technology', industry: 'Software—Infrastructure', hasCache: true },
    { symbol: 'NVDA', name: 'Nvidia', lastMarketCap: 3400, sector: 'Technology', industry: 'Semiconductors', hasCache: true },
    { symbol: 'META', name: 'Meta', lastMarketCap: 1700, sector: 'Communication Services', industry: 'Internet Content', hasCache: true },
    { symbol: 'SHOP', name: 'Shopify', lastMarketCap: 140, sector: 'Technology', industry: 'Software—Application', hasCache: true },
    { symbol: 'MELI', name: 'MercadoLibre', lastMarketCap: 120, sector: 'Consumer Cyclical', industry: 'Internet Retail', hasCache: true },
    { symbol: 'SE', name: 'Sea', lastMarketCap: 110, sector: 'Consumer Cyclical', industry: 'Internet Retail', hasCache: true },
    { symbol: 'TIE', name: 'TieCorp', lastMarketCap: 100, sector: 'Technology', industry: 'Software—Application', hasCache: true },
    { symbol: 'ZETA', name: 'Zeta', lastMarketCap: 100, sector: 'Technology', industry: 'Software—Application', hasCache: true }, // cap tie with TIE
    { symbol: 'SOLO', name: 'SoloCo', lastMarketCap: 50, sector: 'Utilities', industry: 'Renewable Utilities', hasCache: true },
    { symbol: 'SPY', name: 'SPDR ETF', lastMarketCap: 999, sector: null, industry: null, hasCache: false }, // ETF — excluded
    { symbol: 'GONE', name: 'NoCap Co', lastMarketCap: null, sector: 'Technology', industry: 'Semiconductors', hasCache: true },
];

function val(row: Row, field: string): unknown {
    if (field === 'analysisCache') return row.hasCache ? { symbol: row.symbol } : null;
    return (row as Record<string, unknown>)[field];
}

function matchCond(row: Row, cond: any): boolean {
    if (cond.OR) return cond.OR.some((c: any) => matchCond(row, c));
    if (cond.AND) return cond.AND.every((c: any) => matchCond(row, c));
    return Object.entries(cond).every(([k, v]: [string, any]) => {
        const rv = val(row, k);
        if (v && typeof v === 'object') {
            if ('isNot' in v) return v.isNot === null ? rv !== null : rv !== v.isNot;
            if ('gt' in v) return typeof rv === 'string' ? rv > v.gt : typeof rv === 'number' && rv > v.gt;
            if ('lt' in v) return typeof rv === 'string' ? rv < v.lt : typeof rv === 'number' && rv < v.lt;
            return rv === v;
        }
        return rv === v;
    });
}

function applyWhere(rows: Row[], where: any): Row[] {
    return rows.filter(r => matchCond(r, where));
}

function applyOrder(rows: Row[], orderBy: { [k: string]: 'asc' | 'desc' }[]): Row[] {
    return [...rows].sort((a, b) => {
        for (const o of orderBy) {
            const [k, dir] = Object.entries(o)[0]!;
            const av = val(a, k) as any, bv = val(b, k) as any;
            if (av == null && bv == null) continue;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av === bv) continue;
            const cmp = av < bv ? -1 : 1;
            return dir === 'asc' ? cmp : -cmp;
        }
        return 0;
    });
}

const tickerFindFirst = jest.fn(async ({ where, orderBy }: any) => {
    const r = applyOrder(applyWhere(ROWS, where), orderBy)[0];
    return r ? { symbol: r.symbol, name: r.name } : null;
});
const tickerFindUnique = jest.fn(async ({ where }: any) => {
    const r = ROWS.find(x => x.symbol === where.symbol);
    if (!r) return null;
    return {
        lastMarketCap: r.lastMarketCap,
        sector: r.sector,
        industry: r.industry,
        analysisCache: r.hasCache ? { symbol: r.symbol } : null,
    };
});

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        ticker: {
            findFirst: (a: unknown) => tickerFindFirst(a),
            findUnique: (a: unknown) => tickerFindUnique(a),
        },
    },
}));

// eslint-disable-next-line import/first
import { getTickerNav } from '@/lib/analysis/tickerNav';

describe('getTickerNav', () => {
    it('market_cap mode returns ordered neighbors; ETF (no cache) is out of the universe', async () => {
        const nav = (await getTickerNav('META'))!;
        // Order: AAPL 3800, MSFT 3600, NVDA 3400, META 1700, SHOP 140, MELI 120, SE 110, TIE 100, ZETA 100, SOLO 50
        // SPY (999) is NOT eligible — no AnalysisCache.
        expect(nav.market_cap.prev?.symbol).toBe('NVDA');
        expect(nav.market_cap.next?.symbol).toBe('SHOP');
        expect(nav.market_cap.available).toBe(true);
    });

    it('sector mode restricts to same sector', async () => {
        const nav = (await getTickerNav('NVDA'))!;
        // Technology: AAPL 3800, MSFT 3600, NVDA 3400, SHOP 140, TIE 100, ZETA 100
        expect(nav.sector.prev?.symbol).toBe('MSFT');
        expect(nav.sector.next?.symbol).toBe('SHOP');
        expect(nav.sector.label).toBe('Technology');
    });

    it('industry mode restricts to same industry', async () => {
        const nav = (await getTickerNav('MELI'))!;
        // Internet Retail: MELI 120, SE 110
        expect(nav.industry.prev).toBeNull();
        expect(nav.industry.next?.symbol).toBe('SE');
        expect(nav.industry.label).toBe('Internet Retail');
    });

    it('symbol ASC breaks market-cap ties deterministically', async () => {
        // TIE 100 & ZETA 100 → order …, TIE, ZETA, SOLO
        const tie = (await getTickerNav('TIE'))!;
        expect(tie.sector.prev?.symbol).toBe('SHOP');
        expect(tie.sector.next?.symbol).toBe('ZETA');
        const zeta = (await getTickerNav('ZETA'))!;
        expect(zeta.sector.prev?.symbol).toBe('TIE');
        expect(zeta.sector.next).toBeNull(); // last in Technology
    });

    it('disables the edge arrows at universe boundaries', async () => {
        const top = (await getTickerNav('AAPL'))!;
        expect(top.market_cap.prev).toBeNull();
        expect(top.market_cap.next?.symbol).toBe('MSFT');
        const bottom = (await getTickerNav('SOLO'))!;
        expect(bottom.market_cap.next).toBeNull();
        expect(bottom.market_cap.prev?.symbol).toBe('ZETA');
    });

    it('marks single-member industry modes unavailable-ish (both neighbors null)', async () => {
        const nav = (await getTickerNav('SOLO'))!;
        expect(nav.sector.prev).toBeNull();
        expect(nav.sector.next).toBeNull();
        expect(nav.industry.prev).toBeNull();
        expect(nav.industry.next).toBeNull();
    });

    it('returns null for tickers outside the eligible universe', async () => {
        expect(await getTickerNav('SPY')).toBeNull();      // no AnalysisCache
        expect(await getTickerNav('GONE')).toBeNull();     // no market cap
        expect(await getTickerNav('NOPE')).toBeNull();     // no row at all
    });
});
