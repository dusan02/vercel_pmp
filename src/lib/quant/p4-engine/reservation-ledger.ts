import { RiskLedgerState } from './risk-types';
import { Reservation, ExecutionEvent } from './execution-types';
import { CorporateAction } from './corporate-actions';

export class ReservationLedger {
    private settledCash: number;
    private availableCash: number;
    private reservations: Map<string, Reservation> = new Map();
    private processedFills: Set<string> = new Set();
    private processedCorporateActions: Set<string> = new Set();
    private positions: Record<string, { shares: number, costBasis: number, realizedPnL: number }> = {};
    private receivables: Record<string, { amount: number }> = {};
    private ledgerVersion: number = 1;
    public isBankrupt: boolean = false;

    constructor(initialCash: number) {
        this.settledCash = initialCash;
        this.availableCash = initialCash;
    }

    public getVersion(): number { return this.ledgerVersion; }
    public getAvailableCash(): number { return this.availableCash; }
    public getSettledCash(): number { return this.settledCash; }
    public getReservation(id: string): Reservation | undefined { return this.reservations.get(id); }
    public getPositions() { return this.positions; }
    public getReceivables() { return this.receivables; }
    public getProcessedFills() { return Array.from(this.processedFills); }
    public hasProcessedCorporateAction(id: string) { return this.processedCorporateActions.has(id); }

    public canReserve(res: Reservation): boolean {
        if (this.reservations.has(res.reservationId)) return false;
        const requiredCash = (res.action === 'BUY' ? res.totalShares * res.reservedPrice : 0) + res.reservedFee;
        return requiredCash <= this.availableCash + 1e-8;
    }

    public reserve(res: Reservation) {
        if (!this.canReserve(res)) throw new Error(`Reservation failed validation`);
        const requiredCash = (res.action === 'BUY' ? res.totalShares * res.reservedPrice : 0) + res.reservedFee;
        this.availableCash -= requiredCash;
        res.status = 'RESERVED';
        this.reservations.set(res.reservationId, res);
        this.ledgerVersion++;
    }

    public canApplyExecutionEvent(event: ExecutionEvent): boolean {
        const res = this.reservations.get(event.reservationId);
        if (!res) return false;
        if (['FILLED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(res.status)) return false; 
        
        if (event.type === 'PARTIAL_FILL' || event.type === 'FILL') {
            if (this.processedFills.has(event.fillId)) return true; // Safe to replay idempotently
            if (res.filledShares + event.shares > res.totalShares + 1e-8) return false; // Overfill
            if (res.action === 'SELL') {
                const pos = this.positions[res.ticker];
                if (!pos || pos.shares < event.shares - 1e-8) return false; // Short execution block
            }
        }
        return true;
    }

    public applyExecutionEvent(event: ExecutionEvent) {
        if (!this.canApplyExecutionEvent(event)) throw new Error(`Execution event ${event.type} invalid`);
        const res = this.reservations.get(event.reservationId)!;

        switch (event.type) {
            case 'PARTIAL_FILL':
            case 'FILL':
                if (this.processedFills.has(event.fillId)) return; 
                const gross = event.shares * event.price;
                if (res.action === 'BUY') {
                    this.settledCash -= (gross + event.fee);
                    const pos = this.positions[res.ticker] || { shares: 0, costBasis: 0, realizedPnL: 0 };
                    const newShares = pos.shares + event.shares;
                    pos.costBasis = ((pos.shares * pos.costBasis) + gross) / newShares;
                    pos.shares = newShares;
                    this.positions[res.ticker] = pos;
                } else {
                    this.settledCash += (gross - event.fee);
                    const pos = this.positions[res.ticker];
                    pos.realizedPnL += (event.price - pos.costBasis) * event.shares;
                    pos.shares -= event.shares;
                    if (pos.shares <= 1e-8) delete this.positions[res.ticker];
                }

                if (this.settledCash < -1e-8) this.isBankrupt = true;

                this.processedFills.add(event.fillId);
                res.filledShares += event.shares;
                
                if (event.type === 'FILL' || res.filledShares >= res.totalShares - 1e-8) {
                    res.status = 'FILLED';
                    this.reconcileTerminalReservation(res);
                } else {
                    res.status = 'PARTIALLY_FILLED';
                }
                break;

            case 'REJECT':
            case 'CANCEL':
            case 'EXPIRE':
                res.status = event.type === 'REJECT' ? 'REJECTED' : event.type === 'CANCEL' ? 'CANCELLED' : 'EXPIRED';
                this.reconcileTerminalReservation(res);
                break;
        }
        this.ledgerVersion++;
    }

    public applyCorporateAction(action: CorporateAction) {
        if (this.processedCorporateActions.has(action.actionId)) return;
        
        const pos = this.positions[action.ticker];
        switch (action.type) {
            case 'SPLIT':
                if (!pos) break;
                if (!action.splitFactor || action.splitFactor <= 0) throw new Error("Invalid split");
                pos.shares *= action.splitFactor;
                pos.costBasis /= action.splitFactor;
                break;
            case 'DIV_EX':
                if (!pos) break;
                if (!action.dividendAmount || action.dividendAmount < 0) throw new Error("Invalid dividend");
                const payout = pos.shares * action.dividendAmount;
                const rec = this.receivables[action.ticker] || { amount: 0 };
                rec.amount += payout;
                this.receivables[action.ticker] = rec;
                break;
            case 'DIV_PAY':
                const receivable = this.receivables[action.ticker];
                if (receivable && receivable.amount > 0) {
                    this.settledCash += receivable.amount;
                    receivable.amount = 0;
                    this.syncCash();
                }
                break;
            case 'DELISTING':
                if (!pos) break;
                pos.realizedPnL -= (pos.shares * pos.costBasis); 
                pos.costBasis = 0;
                break;
        }
        this.processedCorporateActions.add(action.actionId);
        this.ledgerVersion++;
    }

    private reconcileTerminalReservation(res: Reservation) {
        if (res.action === 'BUY') {
            const unfilledShares = res.totalShares - res.filledShares;
            if (unfilledShares > 1e-8) {
                const unfilledRatio = unfilledShares / res.totalShares;
                const freedNotional = unfilledShares * res.reservedPrice;
                const freedFee = res.reservedFee * unfilledRatio; 
                this.availableCash += (freedNotional + freedFee);
            }
        }
        this.syncCash(); 
    }
    
    private syncCash() {
        let totalLocked = 0;
        for (const res of this.reservations.values()) {
            if (!['FILLED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(res.status)) {
                if (res.action === 'BUY') {
                    const unfilled = res.totalShares - res.filledShares;
                    const unfilledRatio = unfilled / res.totalShares;
                    totalLocked += (unfilled * res.reservedPrice) + (res.reservedFee * unfilledRatio);
                } else {
                    totalLocked += res.reservedFee;
                }
            }
        }
        this.availableCash = this.settledCash - totalLocked;
    }
}
