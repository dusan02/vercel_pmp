import { PrismaClient } from '@prisma/client';
import { CorporateAction } from './corporate-actions';

export class PitReconstructor {
    private prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    public async getTradableUniverse(knowledgeTime: Date, economicDate: Date): Promise<any[]> {
        // 1. Fetch all securities that have at least one lifecycle fact known at knowledgeTime
        const allLifecycleFacts = await (this.prisma as any).pitLifecycleFact.findMany({
            where: {
                availableAt: { lte: knowledgeTime },
                supersededAt: { gt: knowledgeTime }
            },
            orderBy: [
                { securityId: 'asc' },
                { effectiveDate: 'desc' },
                { availableAt: 'desc' }
            ]
        });

        const activeStatusMap = new Map<string, any>();
        for (const fact of allLifecycleFacts) {
            if (fact.effectiveDate <= economicDate) {
                if (!activeStatusMap.has(fact.securityId)) {
                    activeStatusMap.set(fact.securityId, fact);
                }
            }
        }

        const tickerHistories = await (this.prisma as any).pitTickerHistory.findMany();

        const universe = [];
        for (const [secId, fact] of activeStatusMap.entries()) {
            if (fact.status === 'LISTED') {
                // Resolve Ticker at economicDate
                const hist = tickerHistories.find((th: any) => 
                    th.securityId === secId && 
                    th.startDate <= economicDate && 
                    (th.endDate === null || th.endDate > economicDate)
                );
                
                universe.push({
                    securityId: secId,
                    ticker: hist ? hist.ticker : 'UNKNOWN',
                    status: fact.status,
                    effectiveSince: fact.effectiveDate.toISOString()
                });
            }
        }

        return universe;
    }

    public async getPrices(tradeDate: Date, knowledgeTime: Date, securityIds: string[]) {
        const prices = await (this.prisma as any).pitPriceFact.findMany({
            where: {
                securityId: { in: securityIds },
                tradeDate: tradeDate,
                availableAt: { lte: knowledgeTime },
                supersededAt: { gt: knowledgeTime }
            }
        });
        const map = new Map<string, any>();
        for (const p of prices) {
            const existing = map.get(p.securityId);
            if (!existing || p.availableAt > existing.availableAt) {
                map.set(p.securityId, { ...p, volume: p.volume.toString() });
            }
        }
        return Array.from(map.values());
    }

    public async getCorporateActions(knowledgeTime: Date, securityIds: string[], effectiveDateLte?: Date): Promise<any[]> {
        const whereClause: any = {
            securityId: { in: securityIds },
            availableAt: { lte: knowledgeTime },
            supersededAt: { gt: knowledgeTime }
        };
        if (effectiveDateLte) {
            whereClause.effectiveDate = { lte: effectiveDateLte };
        }

        const actions = await (this.prisma as any).pitCorporateAction.findMany({
            where: whereClause
        });
        
        const tickerHistories = await (this.prisma as any).pitTickerHistory.findMany({
            where: { securityId: { in: securityIds } }
        });

        const map = new Map<string, any>();
        for (const a of actions) {
            const existing = map.get(a.economicActionId);
            if (!existing || a.availableAt > existing.availableAt) {
                map.set(a.economicActionId, a);
            }
        }
        
        return Array.from(map.values()).map((a: any) => {
            const hist = tickerHistories.find((th: any) => 
                th.securityId === a.securityId && 
                th.startDate <= a.effectiveDate && 
                (th.endDate === null || th.endDate > a.effectiveDate)
            );
            return {
                actionId: a.id,
                economicActionId: a.economicActionId,
                ticker: hist ? hist.ticker : 'UNKNOWN', 
                effectiveDate: a.effectiveDate.toISOString(),
                publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
                availableAt: a.availableAt.toISOString(),
                type: a.actionType,
                splitFactor: a.splitFactor,
                dividendAmount: a.dividendAmount,
                payDate: a.payDate ? a.payDate.toISOString() : null,
                recordDate: a.recordDate ? a.recordDate.toISOString() : null
            };
        });
    }

    public async getLatestFundamentals(knowledgeTime: Date, securityIds: string[]) {
        const facts = await (this.prisma as any).pitFundamentalFact.findMany({
            where: {
                securityId: { in: securityIds },
                availableAt: { lte: knowledgeTime },
                supersededAt: { gt: knowledgeTime }
            },
            orderBy: [
                { securityId: 'asc' },
                { periodEndDate: 'desc' },
                { availableAt: 'desc' }
            ]
        });
        
        const map = new Map<string, any>();
        for (const f of facts) {
            if (!map.has(f.securityId)) {
                map.set(f.securityId, f);
            }
        }
        return Array.from(map.values());
    }

    public async getAllActiveFundamentals(knowledgeTime: Date, securityIds: string[]) {
        return await (this.prisma as any).pitFundamentalFact.findMany({
            where: {
                securityId: { in: securityIds },
                availableAt: { lte: knowledgeTime },
                supersededAt: { gt: knowledgeTime }
            },
            orderBy: { id: 'asc' }
        });
    }
}
