import { PrismaClient } from './client';

export class PitReconstructor {
    private prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    /**
     * Gets the price state as it was known at `knowledgeTime`, 
     * evaluating up to `economicTime` (tradeDate).
     */
    public async getPrices(
        securityId: string, 
        knowledgeTime: Date,
        maxTradeDate?: Date
    ) {
        return await this.prisma.pitPriceFact.findMany({
            where: {
                securityId: securityId,
                availableAt: { lte: knowledgeTime },
                supersededAt: { gt: knowledgeTime },
                ...(maxTradeDate ? { tradeDate: { lte: maxTradeDate } } : {})
            },
            orderBy: { tradeDate: 'asc' }
        });
    }

    /**
     * Returns the set of securityIds that were actively traded at `queryTime`.
     *
     * A security is in the active universe at time T if ALL of the following hold:
     *   1. It has at least one PitTickerHistory row where startDate <= T
     *      AND (endDate IS NULL OR endDate > T) — i.e., it had an active ticker at T.
     *   2. It has no DELISTED PitLifecycleFact with effectiveDate <= T
     *      (if lifecycle facts exist; if none exist, the ticker history is the
     *      sole arbiter).
     *
     * NOTE: PitSecurity in the current schema does not have listDate/delistedDate
     * fields. The temporal filter is therefore driven entirely by
     * PitTickerHistory (ticker validity) and PitLifecycleFact (LISTED/DELISTED
     * status). This is PIT-correct: we only include securities for which we can
     * prove a ticker was in use at the query time.
     *
     * @param queryTime The point-in-time at which to evaluate the universe.
     * @returns Array of securityId strings that were active at queryTime.
     */
    public async getActiveUniverse(queryTime: Date): Promise<string[]> {
        // 1. Find all securities with an active ticker at queryTime
        const activeTickerHistories = await this.prisma.pitTickerHistory.findMany({
            where: {
                startDate: { lte: queryTime },
                OR: [
                    { endDate: null },
                    { endDate: { gt: queryTime } }
                ]
            },
            select: { securityId: true }
        });

        const candidates = new Set(activeTickerHistories.map(th => th.securityId));
        if (candidates.size === 0) return [];

        // 2. Exclude securities that were DELISTED on or before queryTime.
        //    We look at the most recent lifecycle fact (by effectiveDate) that
        //    was known at queryTime. If the latest status is DELISTED, exclude.
        const lifecycleFacts = await this.prisma.pitLifecycleFact.findMany({
            where: {
                securityId: { in: Array.from(candidates) },
                effectiveDate: { lte: queryTime },
                availableAt: { lte: queryTime },
                supersededAt: { gt: queryTime }
            },
            orderBy: [
                { securityId: 'asc' },
                { effectiveDate: 'desc' }
            ]
        });

        const delistedSecurityIds = new Set<string>();
        const seenSecurityIds = new Set<string>();
        for (const lf of lifecycleFacts) {
            // Only consider the first (latest) fact per securityId
            if (seenSecurityIds.has(lf.securityId)) continue;
            seenSecurityIds.add(lf.securityId);
            if (lf.status === 'DELISTED') {
                delistedSecurityIds.add(lf.securityId);
            }
        }

        // 3. Return candidates minus delisted
        return Array.from(candidates).filter(id => !delistedSecurityIds.has(id));
    }
}
