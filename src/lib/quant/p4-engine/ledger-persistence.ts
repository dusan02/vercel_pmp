import { ReservationLedger } from './reservation-ledger';
import { LedgerEvent } from './persistence-types';
import { Reservation } from './execution-types';
import { FileWAL } from './file-wal';

export class LedgerRestorer {
    public static restore(initialCash: number, walPath: string): ReservationLedger {
        const ledger = new ReservationLedger(initialCash);
        const wal = new FileWAL(walPath);
        const events = wal.readAll();
        
        for (const event of events) {
            switch (event.type) {
                case 'INTENT_RESERVED':
                    const res: Reservation = {
                        reservationId: `RES-${event.decision.decisionId}`,
                        intentId: event.intent.intentId,
                        decisionId: event.decision.decisionId,
                        ticker: event.intent.ticker,
                        action: event.intent.action,
                        totalShares: event.intent.shares,
                        filledShares: 0,
                        reservedPrice: event.intent.price,
                        reservedFee: event.intent.fee,
                        status: 'CREATED'
                    };
                    // Use force apply since it passed validation historically
                    ledger.reserve(res);
                    break;
                    
                case 'EXECUTION_APPLIED':
                    ledger.applyExecutionEvent(event.execution);
                    break;
                    
                case 'CORPORATE_ACTION_APPLIED':
                    ledger.applyCorporateAction(event.action);
                    break;
            }
        }
        wal.close();
        return ledger;
    }
}
