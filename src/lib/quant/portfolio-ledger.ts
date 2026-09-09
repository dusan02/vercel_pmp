import { safeAdd, safeSub, safeMul, safeDiv, safeAbs, safeNum } from './safe-math';
export type Side = 'BUY' | 'SELL';
export type EventType = 'DEPOSIT' | 'WITHDRAWAL' | 'ORDER' | 'EXECUTION' | 'FEE' | 'DIVIDEND' | 'DIVIDEND_EX' | 'DIVIDEND_PAY' | 'SPLIT' | 'SYMBOL_CHANGE' | 'TERMINAL_VALUE';

// 1. Corporate Actions (affect positions before anything else)
// 2. Cashflows
// 3. Orders
// 4. Executions
// 5. Fees
const EVENT_PRIORITY: Record<EventType, number> = {
  'SPLIT': 1, 'SYMBOL_CHANGE': 1, 'DIVIDEND': 1, 'DIVIDEND_EX': 1, 'DIVIDEND_PAY': 2, 'TERMINAL_VALUE': 1,
  'DEPOSIT': 2, 'WITHDRAWAL': 2,
  'ORDER': 3,
  'EXECUTION': 4,
  'FEE': 5
};

export interface LedgerEvent {
  id: string;
  timestamp: Date;
  sequence: number;
  type: EventType;
  amount?: number;
  orderId?: string;
  securityId?: string;
  side?: Side;
  orderQuantity?: number;
  notionalValue?: number;
  fillQuantity?: number;
  price?: number;
  corporateActionId?: string;
  ratio?: number;
  newSecurityId?: string;
  decisionPrice?: number;
}



export class PortfolioState {
  cash: number = 0;
  receivables: number = 0;
  accruals = new Map<string, number>();
  realizedPnL: number = 0;
  feesPaid: number = 0;
  positions = new Map<string, { shares: number; costBasis: number }>();
  orders = new Map<string, { securityId: string; side: Side; quantity?: number; notionalValue?: number; filled: number; timestamp: Date; decisionPrice?: number }>();
  appliedCorporateActions = new Set<string>();

  applyEvent(e: LedgerEvent) {
    if (e.type === 'DEPOSIT') {
      this.cash = safeAdd(this.cash, e.amount!);
    } else if (e.type === 'WITHDRAWAL') {
      this.cash = safeSub(this.cash, e.amount!);
    } else if (e.type === 'FEE') {
      this.cash = safeSub(this.cash, e.amount!);
      this.feesPaid = safeAdd(this.feesPaid, e.amount!);
    } else if (e.type === 'ORDER') {
      if (this.orders.has(e.orderId!)) throw new Error("REJECT_DUPLICATE_ORDER");
      this.orders.set(e.orderId!, { securityId: e.securityId!, side: e.side!, quantity: e.orderQuantity, notionalValue: e.notionalValue, filled: 0, timestamp: e.timestamp, decisionPrice: e.decisionPrice });
    } else if (e.type === 'EXECUTION') {
      const order = this.orders.get(e.orderId!);
      if (!order) throw new Error("REJECT_EXECUTION_ORPHANED");
      if (e.timestamp.getTime() < order.timestamp.getTime()) throw new Error("REJECT_EXECUTION_ORPHANED"); // Temporal breach
      
      const qty = safeNum(e.fillQuantity!);
      const px = safeNum(e.price!);
      const fillValue = safeMul(qty, px);
      
      order.filled = safeAdd(order.filled, qty);
      if (order.quantity && order.filled > order.quantity) throw new Error("REJECT_OVERFILL");
      
      let pos = this.positions.get(e.securityId!) || { shares: 0, costBasis: 0 };
      
      if (e.side === 'BUY') {
        this.cash = safeSub(this.cash, fillValue);
        if (pos.shares < 0) {
          const absShares = safeAbs(pos.shares);
          const coverQty = qty < absShares ? qty : absShares;
          const realized = safeMul(safeSub(pos.costBasis, px), coverQty);
          this.realizedPnL = safeAdd(this.realizedPnL, realized);
          
          const remaining = safeSub(qty, coverQty);
          if (remaining > 0) { pos.shares = remaining; pos.costBasis = px; } 
          else { pos.shares = safeAdd(pos.shares, qty); }
        } else {
          const currentVal = safeMul(pos.shares, pos.costBasis);
          const totalVal = safeAdd(currentVal, fillValue);
          pos.shares = safeAdd(pos.shares, qty);
          pos.costBasis = pos.shares === 0 ? 0 : safeDiv(totalVal, pos.shares);
        }
      } else if (e.side === 'SELL') {
        this.cash = safeAdd(this.cash, fillValue);
        if (pos.shares > 0) {
          const sellQty = qty < pos.shares ? qty : pos.shares;
          const realized = safeMul(safeSub(px, pos.costBasis), sellQty);
          this.realizedPnL = safeAdd(this.realizedPnL, realized);
          
          const remaining = safeSub(qty, sellQty);
          if (remaining > 0) { pos.shares = safeSub(0, remaining); pos.costBasis = px; } 
          else { pos.shares = safeSub(pos.shares, qty); }
        } else {
          const absShares = safeAbs(pos.shares);
          const currentVal = safeMul(absShares, pos.costBasis);
          const totalVal = safeAdd(currentVal, fillValue);
          pos.shares = safeSub(pos.shares, qty);
          pos.costBasis = pos.shares === 0 ? 0 : safeDiv(totalVal, safeAbs(pos.shares));
        }
      }
      
      if (pos.shares === 0) this.positions.delete(e.securityId!);
      else this.positions.set(e.securityId!, pos);
      
    } else if (e.type === 'SPLIT') {
      if (this.appliedCorporateActions.has(e.corporateActionId!)) throw new Error("REJECT_DUPLICATE_EVENT");
      const pos = this.positions.get(e.securityId!);
      if (pos) {
        const ratio = safeNum(e.ratio!);
        pos.shares = safeMul(pos.shares, ratio);
        pos.costBasis = safeDiv(pos.costBasis, ratio);
      }
      this.appliedCorporateActions.add(e.corporateActionId!);
    } else if (e.type === 'DIVIDEND_EX') {
      if (this.appliedCorporateActions.has(e.corporateActionId!)) throw new Error("REJECT_DUPLICATE_EVENT");
      const pos = this.positions.get(e.securityId!);
      const accrual = (pos && pos.shares !== 0) ? safeMul(pos.shares, safeNum(e.amount!)) : 0;
      this.receivables = safeAdd(this.receivables, accrual);
      this.accruals.set(e.corporateActionId!, accrual);
      this.appliedCorporateActions.add(e.corporateActionId!);
    } else if (e.type === 'DIVIDEND_PAY') {
      const accrual = this.accruals.get(e.corporateActionId!);
      if (accrual !== undefined) {
        this.receivables = safeSub(this.receivables, accrual);
        this.cash = safeAdd(this.cash, accrual);
        this.accruals.delete(e.corporateActionId!);
      } else {
        throw new Error("REJECT_ORPHANED_DIVIDEND_PAY");
      }
    } else if (e.type === 'SYMBOL_CHANGE') {
      const pos = this.positions.get(e.securityId!);
      if (pos) {
        this.positions.set(e.newSecurityId!, { ...pos });
        this.positions.delete(e.securityId!);
      }
      this.appliedCorporateActions.add(e.corporateActionId!);
    }
  }

  getNAV(marketPrices: Map<string, number>): number {
    let nav = this.cash + this.receivables;
    for (const [secId, pos] of this.positions.entries()) {
      const price = marketPrices.get(secId);
      if (price === undefined || Number.isNaN(price) || price < 0) throw new Error(`REJECT_INVALID_MARKET_DATA: missing or invalid price for ${secId}`);
      nav += pos.shares * price;
    }
    return nav;
  }
}

export class PortfolioLedger {
  private events: LedgerEvent[] = [];
  private eventIds = new Set<string>();

  append(event: LedgerEvent) {
    if (this.eventIds.has(event.id)) throw new Error(`REJECT_DUPLICATE_EVENT: ${event.id}`);
    this.events.push(event);
    this.eventIds.add(event.id);
  }

  getEvents(): ReadonlyArray<LedgerEvent> {
    return Object.freeze([...this.events]);
  }

  getStateAsOf(timestamp: Date): PortfolioState {
    const state = new PortfolioState();
    const sorted = [...this.events]
      .filter(e => e.timestamp.getTime() <= timestamp.getTime())
      .sort((a, b) => {
        if (a.timestamp.getTime() !== b.timestamp.getTime()) return a.timestamp.getTime() - b.timestamp.getTime();
        const pA = EVENT_PRIORITY[a.type] || 99;
        const pB = EVENT_PRIORITY[b.type] || 99;
        if (pA !== pB) return pA - pB;
        if (a.sequence !== b.sequence) return a.sequence - b.sequence;
        return a.id.localeCompare(b.id);
      });
    
    for (const e of sorted) state.applyEvent(e);
    return state;
  }
}
