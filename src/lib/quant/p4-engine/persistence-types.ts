import { RiskIntent, RiskDecision } from './risk-types';
import { ExecutionEvent, Reservation } from './execution-types';
import { CorporateAction } from './corporate-actions';

export type LedgerEvent = 
    | { type: 'INTENT_RESERVED', version: number, intent: RiskIntent, decision: RiskDecision, timestamp: string }
    | { type: 'EXECUTION_APPLIED', version: number, execution: ExecutionEvent, timestamp: string }
    | { type: 'CORPORATE_ACTION_APPLIED', version: number, action: CorporateAction, timestamp: string };

export interface EventStore {
    appendEvent(event: LedgerEvent): void;
    getEvents(): LedgerEvent[];
}
