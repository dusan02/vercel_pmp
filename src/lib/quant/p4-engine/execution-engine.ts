import { ExecutionConfig, ExecutionRecord, ExecutionStatus } from './execution-types.js';
import { Instant, MarketBar } from './temporal-types.js';
import { TargetPosition, PortfolioState } from './portfolio-types.js';
import { randomUUID } from 'crypto';

export class ExecutionEngine {
    constructor(private config: ExecutionConfig) {}

    public execute(
        state: PortfolioState,
        targets: TargetPosition[], // From P4.6
        signalGenerationTime: Instant,
        marketBarsForExecutionDay: Record<string, MarketBar> // CIK -> Next available Market Bar
    ): { records: ExecutionRecord[], finalCash: number } {
        
        const records: ExecutionRecord[] = [];
        let settledCash = state.cash;
        const currentShares = new Map(state.positions.map(p => [p.cik, p.shares]));

        const sellTargets = targets.filter(t => t.action === "SELL" || t.targetWeight < (currentShares.get(t.cik) || 0) / state.cash); // Simplification: explicit SELL
        const buyTargets = targets.filter(t => t.action === "BUY");

        const processOrder = (cik: string, ticker: string, direction: "BUY" | "SELL", requestedShares: number, allocatedCash: number | null): ExecutionRecord => {
            const bar = marketBarsForExecutionDay[cik];
            const baseRecord = {
                orderId: randomUUID(), cik, ticker, direction, requestedShares,
                orderRoutedAt: signalGenerationTime, filledAt: null, 
                filledShares: 0, grossPrice: 0, slippageBps: this.config.slippageBps, 
                netPrice: 0, fees: 0, totalValue: 0
            };

            if (!bar) {
                return { ...baseRecord, status: "EXECUTION_UNAVAILABLE", failureReason: "Missing market bar for eligible window" };
            }

            // P4.7 Temporal Guard: Bar startTime must be strictly strictly AFTER signalGenerationTime
            // (Assuming MarketBar startTime is the exact open time, e.g., 09:30:00Z)
            if (bar.startTime <= signalGenerationTime) {
                throw new Error(`HARD FAIL: Execution time (${bar.startTime}) is not strictly after Signal time (${signalGenerationTime}). Look-ahead detected.`);
            }

            if (bar.classification !== "VALID" || bar.volume === 0) {
                return { ...baseRecord, status: "NOT_FILLED", failureReason: "Trading Halted or Zero Volume" };
            }

            const grossPrice = bar.open; // We execute at Next Open

            // In BUY, if requestedShares is 0 (derived from cash), we compute it
            let targetShares = requestedShares;
            if (direction === "BUY" && allocatedCash !== null) {
                // Approximate shares we can buy
                const slippageMultiplier = 1 + (this.config.slippageBps / 10000);
                targetShares = Math.floor(allocatedCash / (grossPrice * slippageMultiplier + this.config.commissionPerShare));
                if (targetShares <= 0) {
                    return { ...baseRecord, status: "REJECTED_INSUFFICIENT_CASH", failureReason: `Cannot afford 1 share at ${grossPrice}` };
                }
            }

            // P4.7 Liquidity Guard
            const maxAllowedShares = Math.floor(bar.volume * this.config.maxParticipationRate);
            const filledShares = Math.min(targetShares, maxAllowedShares);

            if (filledShares === 0) {
                return { ...baseRecord, status: "NOT_FILLED", failureReason: "Zero liquidity allowed by participation rate" };
            }

            const isPartial = filledShares < targetShares;
            
            // Cost Model
            const slippageCost = grossPrice * (this.config.slippageBps / 10000);
            const netPrice = direction === "BUY" ? grossPrice + slippageCost : grossPrice - slippageCost;
            const fees = filledShares * this.config.commissionPerShare;
            
            let totalValue = (filledShares * netPrice);
            if (direction === "BUY") totalValue = -(totalValue + fees);
            else totalValue = (totalValue - fees);

            return {
                ...baseRecord,
                filledAt: bar.startTime,
                filledShares,
                grossPrice,
                netPrice,
                fees,
                totalValue,
                status: isPartial ? "PARTIALLY_FILLED" : "FILLED",
                failureReason: isPartial ? `Volume capped at ${maxAllowedShares}` : null
            };
        };

        // 1. Process Sells (Cash Sequencing)
        for (const target of sellTargets) {
            const heldShares = currentShares.get(target.cik) || 0;
            // Target 0 means sell everything
            if (heldShares > 0) {
                const rec = processOrder(target.cik, target.ticker, "SELL", heldShares, null);
                records.push(rec);
                if (rec.status === "FILLED" || rec.status === "PARTIALLY_FILLED") {
                    settledCash += rec.totalValue; // TotalValue is positive for SELL
                }
            }
        }

        // 2. Process Buys using only Settled Cash
        // Total target portfolio weight assumes total NAV.
        // For simplicity in this execution layer, we allocate cash directly proportional to target weight.
        const totalBuyWeight = buyTargets.reduce((sum, t) => sum + t.targetWeight, 0);
        
        for (const target of buyTargets) {
            // Allocate a portion of available settled cash based on relative target weights
            // (If targets sum to 20%, and one is 5%, it gets 5/20 of the dedicated buy capital)
            const relativeAllocation = totalBuyWeight > 0 ? (target.targetWeight / totalBuyWeight) : 0;
            
            // We only use the settledCash available, simulating strict cash sequencing
            const allocatedCash = settledCash * relativeAllocation;
            
            const rec = processOrder(target.cik, target.ticker, "BUY", 0, allocatedCash);
            records.push(rec);
            
            if (rec.status === "FILLED" || rec.status === "PARTIALLY_FILLED") {
                settledCash += rec.totalValue; // TotalValue is negative for BUY
            }
        }

        return { records, finalCash: settledCash };
    }
}
