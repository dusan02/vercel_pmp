import crypto from 'crypto';
import { RiskIntent, RiskLedgerState, RiskDecision, MarketStatus } from './risk-types';

export class RiskEngine {
    
    public static generateDecisionId(intentId: string, ledgerVersion: number): string {
        return crypto.createHash('sha256').update(`${intentId}|${ledgerVersion}`).digest('hex');
    }

    public static evaluateIntent(state: RiskLedgerState, intent: RiskIntent): RiskDecision {
        const decisionId = this.generateDecisionId(intent.intentId, state.ledgerVersion);
        const baseDecision = { decisionId, intentId: intent.intentId };

        // INPUT VALIDATION (NaN, Infinity poisoning protection)
        if (!isFinite(intent.shares) || !isFinite(intent.price) || !isFinite(intent.fee)) {
            return { ...baseDecision, decision: 'REJECT', reason: 'MALFORMED_INTENT: Non-finite numerical inputs' };
        }

        // RULE 3: Strict Long-Only Gating
        if (intent.shares <= 0) {
            return { ...baseDecision, decision: 'REJECT', reason: 'LONG_ONLY_VIOLATION: Shares must be > 0' };
        }
        if (intent.price < 0 || intent.fee < 0) {
            return { ...baseDecision, decision: 'REJECT', reason: 'MALFORMED_INTENT: Price and fee must be >= 0' };
        }

        // DUPLICATE INTENT REJECTION
        for (const pending of state.pendingOrders) {
            if (pending.intentId === intent.intentId) {
                return { ...baseDecision, decision: 'REJECT', reason: 'DUPLICATE_INTENT: Intent ID already pending' };
            }
            // Malformed pending order guard
            if (!isFinite(pending.shares) || !isFinite(pending.price) || !isFinite(pending.fee) || pending.shares <= 0) {
                 return { ...baseDecision, decision: 'REJECT', reason: 'CORRUPT_LEDGER: Pending orders contain invalid numerical state' };
            }
        }

        const marketData = state.prices[intent.ticker] || { val: NaN, status: 'UNVALUED' as MarketStatus };
        
        // RULE 4: Valid Data Gating
        if (intent.action === 'BUY') {
            const invalidStatuses: MarketStatus[] = ['MISSING', 'HALTED', 'UNVALUED', 'DELISTED'];
            if (invalidStatuses.includes(marketData.status) || !isFinite(marketData.val)) {
                return { ...baseDecision, decision: 'REJECT', reason: `DATA_GATING_VIOLATION: Cannot BUY asset with status ${marketData.status}` };
            }
        }

        // NAV CALCULATION (Strict P4.16 Compliance)
        let currentNAV = state.cash;
        if (!isFinite(currentNAV)) return { ...baseDecision, decision: 'REJECT', reason: 'CORRUPT_LEDGER: Cash is not finite' };
        
        if (state.receivables) {
            for (const r of Object.values(state.receivables)) {
                if (!isFinite(r.amount)) return { ...baseDecision, decision: 'REJECT', reason: 'CORRUPT_LEDGER: Receivable is not finite' };
                currentNAV += r.amount;
            }
        }

        for (const [ticker, pos] of Object.entries(state.positions)) {
            if (!isFinite(pos.shares) || pos.shares < 0) return { ...baseDecision, decision: 'REJECT', reason: 'CORRUPT_LEDGER: Invalid position shares' };
            if (pos.shares > 0) {
                const p = state.prices[ticker];
                if (!p || !isFinite(p.val) || p.status === 'UNVALUED' || p.status === 'MISSING') {
                    return { ...baseDecision, decision: 'REJECT', reason: `VALUATION_FAILURE: Cannot calculate NAV due to missing price on held asset ${ticker}` };
                }
                currentNAV += pos.shares * p.val;
            }
        }

        if (currentNAV <= 0) {
            return { ...baseDecision, decision: 'REJECT', reason: 'NAV_FAILURE: Current NAV is zero or negative' };
        }

        // RULE 1: Strict Cash Sufficiency (Pessimistic)
        let availableCash = state.cash;
        for (const pending of state.pendingOrders) {
            availableCash -= pending.fee;
            if (pending.action === 'BUY') {
                availableCash -= (pending.shares * pending.price);
            }
        }

        const intentCost = (intent.action === 'BUY' ? intent.shares * intent.price : 0) + intent.fee;
        // Use epsilon for standard float rounding tolerance (e.g. 0.00000001), not risk headroom
        if (intentCost - availableCash > 1e-8) { 
            return { ...baseDecision, decision: 'REJECT', reason: `CASH_SUFFICIENCY_VIOLATION: Cost ${intentCost} > Available ${availableCash}` };
        }

        // RULE 2: G4 Gross Concentration (Pessimistic)
        if (intent.action === 'BUY') {
            let pendingBuyNotional = 0;
            for (const pending of state.pendingOrders) {
                if (pending.action === 'BUY' && pending.ticker === intent.ticker) {
                    pendingBuyNotional += (pending.shares * pending.price);
                }
            }
            
            const currentShares = state.positions[intent.ticker]?.shares || 0;
            // Use current market value for the existing position, NOT the intent price.
            const currentTickerMV = currentShares * marketData.val; 
            
            const targetTickerExposure = currentTickerMV + pendingBuyNotional + (intent.shares * intent.price);
            const projectedWeight = targetTickerExposure / currentNAV;
            
            // STRICT EPSILON BOUNDARY: Risk headroom is exactly 0. Epsilon handles float noise.
            if (projectedWeight - 0.20 > 1e-8) { 
                return { 
                    ...baseDecision, 
                    decision: 'REJECT', 
                    reason: `G4_CONCENTRATION_VIOLATION: Projected weight ${(projectedWeight*100).toFixed(4)}% exceeds 20%`,
                    projectedWeight
                };
            }
            
            return { ...baseDecision, decision: 'APPROVE', projectedWeight };
        }

        // SELL Validation
        const currentShares = state.positions[intent.ticker]?.shares || 0;
        let pendingSellShares = 0;
        for (const pending of state.pendingOrders) {
            if (pending.action === 'SELL' && pending.ticker === intent.ticker) {
                pendingSellShares += pending.shares;
            }
        }
        
        if (currentShares - pendingSellShares - intent.shares < -1e-8) {
            return { ...baseDecision, decision: 'REJECT', reason: 'SHORT_ONLY_VIOLATION: Cannot sell more than owned or pending sell' };
        }

        return { ...baseDecision, decision: 'APPROVE' };
    }
}
