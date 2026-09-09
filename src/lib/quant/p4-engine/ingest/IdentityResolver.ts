import { PrismaClient } from '../db/client';

export class IdentityResolver {
    private prisma: PrismaClient;
    private tickerTimelineCache: Map<string, Array<{
        startDate: Date | null,
        endDate: Date | null,
        securityId: string
    }>> = new Map();

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    public async initialize() {
        const histories = await this.prisma.pitTickerHistory.findMany({
            select: { ticker: true, startDate: true, endDate: true, securityId: true }
        });
        
        for (const h of histories) {
            const sym = h.ticker.toLowerCase();
            if (!this.tickerTimelineCache.has(sym)) {
                this.tickerTimelineCache.set(sym, []);
            }
            this.tickerTimelineCache.get(sym)!.push({
                startDate: h.startDate,
                endDate: h.endDate,
                securityId: h.securityId
            });
        }
    }

    public resolveAtDate(sourceSymbol: string, tradeDate: Date): string {
        const cleanSymbol = sourceSymbol.replace(/\.US$/i, '').toLowerCase();
        const timeline = this.tickerTimelineCache.get(cleanSymbol);
        
        if (!timeline) throw new Error(`Identity resolution failed: Unknown ticker '${sourceSymbol}'`);

        const targetTime = tradeDate.getTime();
        const matches = timeline.filter(t => {
            const afterStart = !t.startDate || t.startDate.getTime() <= targetTime;
            const beforeEnd = !t.endDate || t.endDate.getTime() >= targetTime;
            return afterStart && beforeEnd;
        });

        if (matches.length === 0) {
            throw new Error(`Identity resolution failed: Ticker '${sourceSymbol}' not mapped to any security at ${tradeDate.toISOString()}`);
        }
        if (matches.length > 1) {
            throw new Error(`Identity resolution failed: AMBIGUOUS OVERLAP for '${sourceSymbol}' at ${tradeDate.toISOString()}. Maps to ${matches.length} securities.`);
        }

        return matches[0].securityId;
    }
}
