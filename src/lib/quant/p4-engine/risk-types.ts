export type MarketStatus = 'VALID' | 'STALE' | 'MISSING' | 'HALTED' | 'UNVALUED' | 'DELISTED';

export interface RiskIntent {
    intentId: string;
    ticker: string;
    action: 'BUY' | 'SELL';
    shares: number;
    price: number; 
    fee: number;
}

export interface RiskLedgerState {
    ledgerVersion: number;
    cash: number;
    positions: Record<string, { shares: number }>;
    prices: Record<string, { val: number, status: MarketStatus }>;
    receivables: Record<string, { amount: number }>; // Required for exact P4.16 NAV match
    pendingOrders: RiskIntent[]; 
}

export interface RiskDecision {
    decisionId: string;
    intentId: string;
    decision: 'APPROVE' | 'REJECT';
    reason?: string;
    projectedWeight?: number;
}
