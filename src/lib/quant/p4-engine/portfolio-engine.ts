import { 
    PortfolioConfig, PortfolioState, SecurityMetadata, TargetPosition, 
    AllocationDecision 
} from './portfolio-types.js';
import { Signal } from './signal-types.js';

export class PortfolioConstructionEngine {
    constructor(private config: PortfolioConfig) {}

    public generateTargets(
        state: PortfolioState,
        signals: Signal[],
        pricesAtT: Record<string, number>,
        metadata: Record<string, SecurityMetadata>
    ): { targets: TargetPosition[], decisions: AllocationDecision[] } {
        
        const decisions: AllocationDecision[] = [];
        const targets: TargetPosition[] = [];
        
        let nav = state.cash;
        const currentWeights = new Map<string, number>();
        const holdingValues = new Map<string, number>();

        for (const pos of state.positions) {
            const price = pricesAtT[pos.cik];
            if (price === undefined) throw new Error(`Missing price for existing holding ${pos.cik}`);
            const val = pos.shares * price;
            holdingValues.set(pos.cik, val);
            nav += val;
        }

        for (const [cik, val] of holdingValues.entries()) {
            currentWeights.set(cik, val / nav);
        }

        let projectedCashWeight = state.cash / nav;
        const projectedSectorWeights = new Map<string, number>();
        
        for (const [cik, w] of currentWeights.entries()) {
            const sec = metadata[cik]?.sector || "UNKNOWN";
            projectedSectorWeights.set(sec, (projectedSectorWeights.get(sec) || 0) + w);
        }

        const signalMap = new Map(signals.map(s => [s.cik, s]));
        
        for (const pos of state.positions) {
            const sig = signalMap.get(pos.cik);
            const isZombie = !sig || sig.universeDecision !== "ELIGIBLE";
            const isExplicitSell = sig && sig.direction === "SELL";

            if (isZombie || isExplicitSell) {
                const w = currentWeights.get(pos.cik)!;
                projectedCashWeight += w;
                const sec = metadata[pos.cik]?.sector || "UNKNOWN";
                projectedSectorWeights.set(sec, projectedSectorWeights.get(sec)! - w);
                
                const reason = isZombie ? "Zombie/Delisted (Dropped from Universe)" : "Explicit SELL signal";

                targets.push({ cik: pos.cik, ticker: pos.ticker, targetWeight: 0, action: "SELL", reason });
                decisions.push({
                    cik: pos.cik, ticker: pos.ticker, action: "SELL", 
                    reason, signalScore: sig ? sig.score : null, portfolioRank: null, targetWeight: 0
                });
                currentWeights.set(pos.cik, 0); 
            }
        }

        const buySignals = signals.filter(s => s.universeDecision === "ELIGIBLE" && s.direction === "BUY");
        
        buySignals.sort((a, b) => {
            const aHold = currentWeights.get(a.cik) && currentWeights.get(a.cik)! > 0 ? 1 : 0;
            const bHold = currentWeights.get(b.cik) && currentWeights.get(b.cik)! > 0 ? 1 : 0;
            if (aHold !== bHold) return bHold - aHold;

            if (a.score !== b.score) return b.score - a.score;
            
            const aAvail = (a.availabilityMask.match(/1/g) || []).length;
            const bAvail = (b.availabilityMask.match(/1/g) || []).length;
            if (aAvail !== bAvail) return bAvail - aAvail;
            
            const aMom = a.featureValues["priceStrengthPct"] ?? -999;
            const bMom = b.featureValues["priceStrengthPct"] ?? -999;
            if (aMom !== bMom) return bMom - aMom;
            
            return a.cik.localeCompare(b.cik);
        });

        let rank = 1;
        let activePositionsCount = Array.from(currentWeights.values()).filter(w => w > 0).length;

        for (const sig of buySignals) {
            const isHeld = currentWeights.get(sig.cik)! > 0;
            const sec = metadata[sig.cik]?.sector || "UNKNOWN";
            const currentSecW = projectedSectorWeights.get(sec) || 0;
            
            if (!isHeld) {
                if (activePositionsCount >= this.config.maxPositions) {
                    decisions.push({ cik: sig.cik, ticker: sig.ticker, action: "REJECTED_BY_PORTFOLIO", reason: "MAX_POSITIONS_EXCEEDED", signalScore: sig.score, portfolioRank: rank, targetWeight: 0 });
                    rank++;
                    continue;
                }
                
                // Allow floating point buffer leniency (e.g. 0.01999999 < 0.02)
                const remainingCash = projectedCashWeight - this.config.maxWeightPerPosition;
                if (remainingCash < this.config.minCashBuffer - 0.000001) {
                    decisions.push({ cik: sig.cik, ticker: sig.ticker, action: "REJECTED_BY_PORTFOLIO", reason: "NO_CASH", signalScore: sig.score, portfolioRank: rank, targetWeight: 0 });
                    rank++;
                    continue;
                }

                if (currentSecW + this.config.maxWeightPerPosition > this.config.maxSectorWeight) {
                    decisions.push({ cik: sig.cik, ticker: sig.ticker, action: "REJECTED_BY_PORTFOLIO", reason: `SECTOR_CAP_EXCEEDED (${sec})`, signalScore: sig.score, portfolioRank: rank, targetWeight: 0 });
                    rank++;
                    continue;
                }
                
                projectedCashWeight -= this.config.maxWeightPerPosition;
                projectedSectorWeights.set(sec, currentSecW + this.config.maxWeightPerPosition);
                activePositionsCount++;
                currentWeights.set(sig.cik, this.config.maxWeightPerPosition);
                
                targets.push({ cik: sig.cik, ticker: sig.ticker, targetWeight: this.config.maxWeightPerPosition, action: "BUY", reason: "Allocated new BUY" });
                decisions.push({ cik: sig.cik, ticker: sig.ticker, action: "BUY", reason: "Sieve Passed", signalScore: sig.score, portfolioRank: rank, targetWeight: this.config.maxWeightPerPosition });
            } else {
                const currentW = currentWeights.get(sig.cik)!;
                if (currentW < this.config.maxWeightPerPosition) {
                    const diff = this.config.maxWeightPerPosition - currentW;
                    if (projectedCashWeight - diff >= this.config.minCashBuffer - 0.000001 && (currentSecW + diff <= this.config.maxSectorWeight)) {
                        projectedCashWeight -= diff;
                        projectedSectorWeights.set(sec, currentSecW + diff);
                        currentWeights.set(sig.cik, this.config.maxWeightPerPosition);
                        targets.push({ cik: sig.cik, ticker: sig.ticker, targetWeight: this.config.maxWeightPerPosition, action: "BUY", reason: "Top-up existing BUY" });
                        decisions.push({ cik: sig.cik, ticker: sig.ticker, action: "BUY", reason: "Topped up", signalScore: sig.score, portfolioRank: rank, targetWeight: this.config.maxWeightPerPosition });
                    } else {
                        targets.push({ cik: sig.cik, ticker: sig.ticker, targetWeight: currentW, action: "HOLD", reason: "Constraints blocked top-up" });
                        decisions.push({ cik: sig.cik, ticker: sig.ticker, action: "HOLD", reason: "Maintained", signalScore: sig.score, portfolioRank: rank, targetWeight: currentW });
                    }
                }
            }
            rank++;
        }

        for (const [cik, w] of currentWeights.entries()) {
            if (w > 0 && !targets.find(t => t.cik === cik)) {
                const targetIdeal = this.config.maxWeightPerPosition; 
                if (Math.abs(w - targetIdeal) < this.config.turnoverThreshold) {
                    targets.push({ cik, ticker: cik, targetWeight: w, action: "NO_ACTION", reason: "Micro-drift threshold not met" });
                    decisions.push({ cik, ticker: cik, action: "NO_ACTION", reason: "Drift ignored", signalScore: null, portfolioRank: null, targetWeight: w });
                } else {
                    targets.push({ cik, ticker: cik, targetWeight: targetIdeal, action: w < targetIdeal ? "BUY" : "SELL", reason: "Rebalance" });
                }
            }
        }

        return { targets, decisions };
    }
}
