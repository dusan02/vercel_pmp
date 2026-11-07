import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';

/**
 * ETF → related equity basket.
 *
 * We don't ingest real ETF holdings files, so baskets are either:
 *  - curated top constituents (approximate, stable large holdings),
 *  - sector-dynamic (top market caps in our DB for the ETF's sector), or
 *  - single-stock underlying (2x NVDA ETF → NVDA + its sector peers).
 * Only symbols that exist in our Ticker table are shown, so a stale curated
 * symbol simply drops out instead of rendering a dead tile.
 */

type BasketDef =
    | { kind: 'list'; label: string; symbols: string[] }
    | { kind: 'sector'; label: string; sector: string }
    | { kind: 'underlying'; label: string; underlying: string }
    | { kind: 'sp500'; label: string }
    | { kind: 'smallcap'; label: string };

const SEMIS = ['NVDA', 'AVGO', 'AMD', 'TSM', 'MU', 'QCOM', 'TXN', 'ASML', 'AMAT', 'LRCX', 'KLAC', 'MRVL', 'ADI', 'INTC', 'ON', 'MCHP'];
const NDX = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'AVGO', 'TSLA', 'COST', 'NFLX', 'AMD', 'PEP', 'ADBE', 'CSCO', 'TMUS', 'INTU'];
const FANG = ['META', 'AAPL', 'AMZN', 'NFLX', 'GOOGL', 'MSFT', 'NVDA', 'TSLA', 'AVGO', 'CRWD', 'NOW'];
const BIOTECH = ['VRTX', 'REGN', 'AMGN', 'GILD', 'BIIB', 'ALNY', 'MRNA', 'INCY', 'EXEL', 'NBIX', 'BMRN', 'UTHR', 'INSM', 'SRPT'];
const GOLD_MINERS = ['NEM', 'AEM', 'B', 'FNV', 'WPM', 'KGC', 'AU', 'GFI', 'RGLD', 'PAAS'];
const CRYPTO_EQ = ['COIN', 'MSTR', 'HOOD', 'MARA', 'RIOT', 'CLSK', 'IREN', 'CIFR', 'GLXY'];
const REGIONAL_BANKS = ['USB', 'PNC', 'TFC', 'MTB', 'FITB', 'HBAN', 'RF', 'CFG', 'KEY', 'ZION', 'WAL', 'EWBC', 'FHN', 'WBS', 'ONB'];
const CHINA = ['BABA', 'PDD', 'JD', 'BIDU', 'NTES', 'TCOM', 'BILI', 'LI', 'NIO', 'XPEV', 'YUMC', 'TME'];
const BRAZIL = ['NU', 'PBR', 'VALE', 'ITUB', 'BBD', 'ABEV', 'XP', 'SBS', 'GGB', 'ERJ'];
const JAPAN = ['TM', 'SONY', 'MUFG', 'SMFG', 'HMC', 'MFG', 'NMR', 'IX'];
const EM = ['TSM', 'BABA', 'PDD', 'INFY', 'HDB', 'IBN', 'VALE', 'NU', 'JD', 'PBR', 'ITUB', 'BIDU'];

const BASKETS: Record<string, BasketDef> = {};
const assign = (symbols: string[], def: BasketDef) => { for (const s of symbols) BASKETS[s] = def; };

assign(['SOXX', 'SMH', 'SOXL', 'SOXS', 'USD'], { kind: 'list', label: 'Semiconductor basket', symbols: SEMIS });
assign(['QQQ', 'QQQM', 'TQQQ', 'SQQQ', 'QLD', 'QID'], { kind: 'list', label: 'Nasdaq-100 top holdings', symbols: NDX });
assign(['FNGU', 'FNGD'], { kind: 'list', label: 'NYSE FANG+ constituents', symbols: FANG });
assign(['XBI', 'IBB', 'LABU', 'LABD'], { kind: 'list', label: 'Biotech basket', symbols: BIOTECH });
assign(['GDX', 'GDXJ', 'NUGT', 'DUST'], { kind: 'list', label: 'Gold miners', symbols: GOLD_MINERS });
assign(['IBIT', 'FBTC', 'GBTC', 'ETHA', 'BITX', 'BITU', 'BITO'], { kind: 'list', label: 'Crypto-linked equities', symbols: CRYPTO_EQ });
assign(['KRE', 'DPST'], { kind: 'list', label: 'Regional banks', symbols: REGIONAL_BANKS });
assign(['FXI', 'KWEB', 'MCHI'], { kind: 'list', label: 'China large-cap / internet', symbols: CHINA });
assign(['EWZ'], { kind: 'list', label: 'Brazil ADRs', symbols: BRAZIL });
assign(['EWJ', 'DXJ'], { kind: 'list', label: 'Japan ADRs', symbols: JAPAN });
assign(['EEM', 'VWO', 'IEMG'], { kind: 'list', label: 'Emerging-market leaders', symbols: EM });

assign(['SPY', 'VOO', 'IVV', 'SPLG', 'RSP', 'UPRO', 'SPXU', 'SSO', 'SDS', 'SPXL', 'SPXS', 'DIA', 'VTI'], { kind: 'sp500', label: 'S&P 500 largest constituents' });
assign(['IWM', 'TNA', 'TZA', 'UWM', 'IJR', 'VB'], { kind: 'smallcap', label: 'Small/mid-cap names we track' });

const SECTOR_ETFS: Record<string, string> = {
    XLK: 'Technology', VGT: 'Technology', TECL: 'Technology', TECS: 'Technology',
    XLF: 'Financial Services', VFH: 'Financial Services', FAS: 'Financial Services', FAZ: 'Financial Services',
    XLV: 'Healthcare', VHT: 'Healthcare',
    XLE: 'Energy', VDE: 'Energy', ERX: 'Energy', ERY: 'Energy', XOP: 'Energy',
    XLI: 'Industrials', ITA: 'Industrials',
    XLY: 'Consumer Cyclical', XLP: 'Consumer Defensive',
    XLB: 'Basic Materials', XLRE: 'Real Estate', VNQ: 'Real Estate',
    XLU: 'Utilities', XLC: 'Communication Services',
};
for (const [etf, sector] of Object.entries(SECTOR_ETFS)) {
    BASKETS[etf] = { kind: 'sector', label: `${sector} sector leaders`, sector };
}

const SINGLE_STOCK: Record<string, string> = {
    NVDL: 'NVDA', NVDU: 'NVDA', NVD: 'NVDA',
    TSLL: 'TSLA', TSLQ: 'TSLA',
    MSFL: 'MSFT', MSFU: 'MSFT', MSFD: 'MSFT',
    AMZU: 'AMZN', AAPU: 'AAPL', METU: 'META', GGLL: 'GOOGL',
    NFLU: 'NFLX', KMLI: 'MELI', CONL: 'COIN',
    MSTU: 'MSTR', MSTX: 'MSTR', PLTU: 'PLTR',
};
for (const [etf, u] of Object.entries(SINGLE_STOCK)) {
    BASKETS[etf] = { kind: 'underlying', label: `Underlying ${u} & sector peers`, underlying: u };
}

export interface EtfBasketItem {
    symbol: string;
    name: string | null;
    lastPrice: number | null;
    lastChangePct: number | null;
    lastMarketCap: number | null;
    rsi14: number | null;
    sma200Pct: number | null;
    isUnderlying?: boolean;
}

export interface EtfBasket {
    label: string;
    items: EtfBasketItem[];
    breadth: { up: number; down: number; avgRsi: number | null; oversold: number; overbought: number };
}

const SELECT = {
    symbol: true, name: true, lastPrice: true, lastChangePct: true, lastMarketCap: true, sector: true,
    analysisCache: { select: { rsi14: true, sma200Pct: true } },
} as const;

type Row = {
    symbol: string; name: string | null; lastPrice: number | null; lastChangePct: number | null;
    lastMarketCap: number | null; sector: string | null;
    analysisCache: { rsi14: number | null; sma200Pct: number | null } | null;
};

const toItem = (r: Row, isUnderlying = false): EtfBasketItem => ({
    symbol: r.symbol,
    name: r.name,
    lastPrice: r.lastPrice,
    lastChangePct: r.lastChangePct,
    lastMarketCap: r.lastMarketCap,
    rsi14: r.analysisCache?.rsi14 ?? null,
    sma200Pct: r.analysisCache?.sma200Pct ?? null,
    ...(isUnderlying ? { isUnderlying: true } : {}),
});

const MAX_ITEMS = 12;

export function hasEtfBasket(symbol: string): boolean {
    return symbol.toUpperCase() in BASKETS;
}

export const getEtfBasket = cache(async (symbol: string): Promise<EtfBasket | null> => {
    const def = BASKETS[symbol.toUpperCase()];
    if (!def) return null;

    const stockBase = { assetType: 'STOCK', lastPrice: { gt: 0 } };
    let items: EtfBasketItem[] = [];

    try {
        if (def.kind === 'list') {
            const rows = await prisma.ticker.findMany({ where: { symbol: { in: def.symbols } }, select: SELECT }) as Row[];
            const bySym = new Map(rows.map((r) => [r.symbol, r]));
            items = def.symbols.map((s) => bySym.get(s)).filter((r): r is Row => !!r).map((r) => toItem(r));
        } else if (def.kind === 'sector') {
            const rows = await prisma.ticker.findMany({
                where: { ...stockBase, sector: def.sector },
                orderBy: { lastMarketCap: 'desc' },
                take: MAX_ITEMS,
                select: SELECT,
            }) as Row[];
            items = rows.map((r) => toItem(r));
        } else if (def.kind === 'sp500') {
            const rows = await prisma.ticker.findMany({
                where: { ...stockBase, inHeatmap: true },
                orderBy: { lastMarketCap: 'desc' },
                take: MAX_ITEMS,
                select: SELECT,
            }) as Row[];
            items = rows.map((r) => toItem(r));
        } else if (def.kind === 'smallcap') {
            const rows = await prisma.ticker.findMany({
                where: { ...stockBase, tier: { gte: 3 } },
                orderBy: { lastMarketCap: 'desc' },
                take: MAX_ITEMS,
                select: SELECT,
            }) as Row[];
            items = rows.map((r) => toItem(r));
        } else if (def.kind === 'underlying') {
            const u = await prisma.ticker.findUnique({ where: { symbol: def.underlying }, select: SELECT }) as Row | null;
            if (u) {
                items.push(toItem(u, true));
                if (u.sector) {
                    const peers = await prisma.ticker.findMany({
                        where: { ...stockBase, sector: u.sector, symbol: { not: u.symbol } },
                        orderBy: { lastMarketCap: 'desc' },
                        take: MAX_ITEMS - 1,
                        select: SELECT,
                    }) as Row[];
                    items.push(...peers.map((r) => toItem(r)));
                }
            }
        }
    } catch {
        return null; // section-level data — degrade by hiding the card
    }

    items = items.slice(0, MAX_ITEMS);
    if (items.length === 0) return null;

    const rsis = items.map((i) => i.rsi14).filter((v): v is number => v != null);
    return {
        label: def.label,
        items,
        breadth: {
            up: items.filter((i) => (i.lastChangePct ?? 0) > 0).length,
            down: items.filter((i) => (i.lastChangePct ?? 0) < 0).length,
            avgRsi: rsis.length ? rsis.reduce((a, b) => a + b, 0) / rsis.length : null,
            oversold: rsis.filter((v) => v <= 30).length,
            overbought: rsis.filter((v) => v >= 70).length,
        },
    };
});
