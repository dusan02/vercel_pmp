import { ExchangeCalendar } from './calendar';
import { Side } from './portfolio-ledger';

export interface Order {
  id: string;
  securityId: string;
  side: Side;
  quantity?: number;
  notionalValue?: number;
  orderType: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  submittedAt: Date;
}

export type OrderState = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';

export interface ActiveOrder extends Order {
  state: OrderState;
  filledQuantity: number;
  remainingQuantity: number;
  remainingNotional?: number;
  delayMs: number;
}

export interface MarketContext {
  timestamp: Date;
  referenceMid: number; // Strictly RAW_EXECUTION_PRICE. Never use ADJUSTED_ANALYTICAL_PRICE.
  volume: number;
}

export interface ExecutionFill {
  orderId: string;
  timestamp: Date;
  quantity: number;
  price: number;
}

export interface SlippageModel {
  getExecutionPrice(side: Side, quantity: number, context: MarketContext): number;
}

export class ExecutionEngine {
  private openOrders = new Map<string, ActiveOrder>();

  constructor(
    private slippageModel: SlippageModel,
    private maxParticipationRate: number = 0.10,
    private flatFee: number = 0,
    private calendar: ExchangeCalendar = new ExchangeCalendar()
  ) {}

  submitOrder(order: Order, delayMs: number = 0) {
    this.openOrders.set(order.id, {
      ...order,
      state: 'OPEN',
      filledQuantity: 0,
      remainingQuantity: order.quantity || 0,
      remainingNotional: order.notionalValue,
      delayMs
    });
  }

  processTick(context: MarketContext): ExecutionFill[] {
    const fills: ExecutionFill[] = [];
    
    for (const [id, ord] of this.openOrders.entries()) {
      const session = this.calendar.getSession(context.timestamp);
      if (!session.isRegular) continue;
      
      if (context.timestamp.getTime() < ord.submittedAt.getTime() + ord.delayMs) {
        continue;
      }
      
      const maxFillQty = context.volume * this.maxParticipationRate;
      if (maxFillQty <= 0) continue;
      
      const isNotional = ord.remainingNotional !== undefined;
      
      let fillQty = 0;
      let executionPrice = 0;

      if (isNotional) {
        // DOMAIN MONOTONICITY SCREEN (Black-Box Heuristic Guard)
        const SOLVER_MONOTONICITY_SAMPLES = 32;
        let prevCost = -1;
        
        for (let i = 0; i <= SOLVER_MONOTONICITY_SAMPLES; i++) {
          const testQ = (maxFillQty * i) / SOLVER_MONOTONICITY_SAMPLES;
          const testP = this.slippageModel.getExecutionPrice(ord.side, testQ, context);
          
          if (Number.isNaN(testP) || !Number.isFinite(testP) || testP <= 0) {
            throw new Error("REJECT_INVALID_EXECUTION_PRICE");
          }
          
          const testCost = testQ * testP;
          
          if (Number.isNaN(testCost) || !Number.isFinite(testCost)) {
            throw new Error("REJECT_INVALID_EXECUTION_PRICE");
          }
          
          if (testCost < prevCost - 1e-8) { // Strict monotonic non-decreasing check (with IEEE float buffer)
            throw new Error("REJECT_NON_MONOTONIC_SLIPPAGE");
          }
          prevCost = testCost;
        }
        
        // NONLINEAR BISECTION SOLVER FOR NOTIONAL BUDGET
        let low = 0;
        let high = maxFillQty;
        
        // Optimize upper bound using base price
        const basePrice = this.slippageModel.getExecutionPrice(ord.side, 1, context);
        if (basePrice > 0) {
          const maxTheoretical = (ord.remainingNotional! / basePrice) * 1.5; // Safety margin for potential slippage discount
          if (high > maxTheoretical) high = maxTheoretical;
        }

        let bestQ = 0;
        let bestPrice = basePrice;
        
        for (let i = 0; i < 50; i++) {
          const mid = (low + high) / 2;
          const p = this.slippageModel.getExecutionPrice(ord.side, mid, context);
          const cost = mid * p;
          
          if (cost <= ord.remainingNotional!) {
            bestQ = mid;
            bestPrice = p;
            low = mid;
          } else {
            high = mid;
          }
        }
        
        fillQty = bestQ;
        executionPrice = this.slippageModel.getExecutionPrice(ord.side, fillQty, context); // Verify determinism
      } else {
        fillQty = Math.min(ord.remainingQuantity, maxFillQty);
        executionPrice = this.slippageModel.getExecutionPrice(ord.side, fillQty, context);
      }

      if (fillQty <= 0) continue;
      
      
      
      

      
            // STRICT OHLC ENVELOPE BOUNDARY
      if (context.low !== undefined && context.high !== undefined) {
         if (executionPrice < context.low || executionPrice > context.high) {
             throw new Error(`REJECT_PRICE_OUTSIDE_ENVELOPE: Price ${executionPrice} outside [${context.low}, ${context.high}]`);
         }
      }

const executionCost = fillQty * executionPrice;
      
      if (isNotional) {
        ord.remainingNotional! -= executionCost;
        ord.filledQuantity += fillQty;
      } else {
        ord.remainingQuantity -= fillQty;
        ord.filledQuantity += fillQty;
      }
      
      // DUST / EXHAUSTION POLICY: $0.01
      const isFilled = isNotional ? (ord.remainingNotional! < 0.01) : (ord.remainingQuantity < 1e-8);
      ord.state = isFilled ? 'FILLED' : 'PARTIAL';

      fills.push({ orderId: id, timestamp: context.timestamp, quantity: fillQty, price: executionPrice });
      
      if (isFilled) {
        this.openOrders.delete(id);
      }
    }
    
    return fills;
  }
}
