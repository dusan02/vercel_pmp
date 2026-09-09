import { RiskEngine } from './risk-engine';
import { RiskIntent, RiskLedgerState } from './risk-types';
import { ReservationLedger } from './reservation-ledger';
import { Reservation, ExecutionEvent } from './execution-types';
import { CorporateAction } from './corporate-actions';
import { FileWAL } from './file-wal';

export class BacktestOrchestrator {
    private ledger: ReservationLedger;
    private store?: FileWAL;

    constructor(initialCash: number, store?: FileWAL) {
        this.ledger = new ReservationLedger(initialCash);
        this.store = store;
    }

    public getVersion(): number { return this.ledger.getVersion(); }
    public getAvailableCash(): number { return this.ledger.getAvailableCash(); }
    public getLedger() { return this.ledger; }

    public processIntent(intent: RiskIntent, currentStateSnapshot: RiskLedgerState): { status: string, reservationId?: string, reason?: string } {
        const decision = RiskEngine.evaluateIntent(currentStateSnapshot, intent);
        if (decision.decision === 'REJECT') return { status: 'REJECTED_BY_RISK', reason: decision.reason };

        const reservationId = `RES-${decision.decisionId}`;
        const res: Reservation = {
            reservationId, intentId: intent.intentId, decisionId: decision.decisionId,
            ticker: intent.ticker, action: intent.action, totalShares: intent.shares,
            filledShares: 0, reservedPrice: intent.price, reservedFee: intent.fee, status: 'CREATED'
        };

        if (!this.ledger.canReserve(res)) return { status: 'REJECTED_BY_LEDGER', reason: 'Insufficient Cash' };
        if (this.store) {
            this.store.append({ type: 'INTENT_RESERVED', version: this.ledger.getVersion(), intent, decision, timestamp: new Date().toISOString() });
        }
        this.ledger.reserve(res);
        return { status: 'RESERVED', reservationId };
    }

    public applyCorporateAction(action: CorporateAction) {
        if (this.ledger.hasProcessedCorporateAction(action.actionId)) return;
        if (this.store) {
            this.store.append({ type: 'CORPORATE_ACTION_APPLIED', version: this.ledger.getVersion(), action, timestamp: new Date().toISOString() });
        }
        this.ledger.applyCorporateAction(action);
    }

    public handleExecutionEvent(event: ExecutionEvent) {
        if (!this.ledger.canApplyExecutionEvent(event)) {
            throw new Error(`Execution event invalid or un-appliable: ${event.type} for ${event.reservationId}`);
        }
        if (this.store) {
            this.store.append({ type: 'EXECUTION_APPLIED', version: this.ledger.getVersion(), execution: event, timestamp: new Date().toISOString() });
        }
        this.ledger.applyExecutionEvent(event);
    }
}
