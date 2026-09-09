export type CorporateActionType = 'SPLIT' | 'DIV_EX' | 'DIV_PAY' | 'DELISTING';

export interface CorporateAction {
    actionId: string; // Deterministic identity for exact-once application
    ticker: string;
    date: string;
    type: CorporateActionType;
    splitFactor?: number; 
    dividendAmount?: number;
}
