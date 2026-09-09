import { EquitySnapshot, TradeRecord, PerformanceMetrics, AttributionReport } from './evaluation-types.js';
import { PortfolioState } from './portfolio-types.js';

export class EvaluationEngine {
    
    public static calculateEquitySnapshot(date: string, state: PortfolioState, marketPrices: Record<string, number>): EquitySnapshot {
        let nav = state.cash;
        const positions = state.positions.map(pos => {
            const price = marketPrices[pos.cik] || 0;
            const marketValue = pos.shares * price;
            nav += marketValue;
            return { cik: pos.cik, ticker: pos.ticker, shares: pos.shares, closePrice: price, marketValue };
        });

        // P4.9 Hard Constraint: NAV must strictly equal cash + sum of positions
        const calculatedNav = state.cash + positions.reduce((sum, p) => sum + p.marketValue, 0);
        if (Math.abs(nav - calculatedNav) > 0.0001) {
            throw new Error(`ACCOUNTING FATAL: NAV mismatch. Base NAV: ${nav}, Calculated: ${calculatedNav}`);
        }

        return { date, cash: state.cash, positions, nav };
    }

    public static calculateAttribution(trades: TradeRecord[]): AttributionReport {
        let totalGrossPnL = 0;
        let totalNetPnL = 0;
        let slippageDrag = 0;
        let feeDrag = 0;

        for (const trade of trades) {
            totalGrossPnL += trade.grossPnL;
            totalNetPnL += trade.netPnL;
            
            // Reconstruct friction
            // Gross PnL = (ExitGross - EntryGross) * shares
            // Net PnL = ((ExitGross - ExitSlippage) - (EntryGross + EntrySlippage)) * shares - (EntryFees + ExitFees)
            const slipCost = (trade.entrySlippage + trade.exitSlippage) * trade.shares;
            const feeCost = trade.entryFees + trade.exitFees;
            
            slippageDrag += slipCost;
            feeDrag += feeCost;
        }

        return { totalNetPnL, totalGrossPnL, slippageDrag, feeDrag };
    }
}
