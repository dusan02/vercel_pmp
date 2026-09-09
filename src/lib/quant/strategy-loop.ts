import { PITEngine } from './pit-engine';
import { PortfolioLedger, PortfolioState } from './portfolio-ledger';
import { ExecutionEngine, Order } from './execution-engine';

export interface StrategyContext {
  readonly timestamp: Date;
  readonly universe: readonly string[];
  readonly portfolio: Readonly<any>;
  getKnowledge: (securityId: string) => Promise<any>;
}

export interface Strategy {
  generateOrders(context: StrategyContext): Promise<Order[]>;
}

function deepFreeze(obj: any): any {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach(prop => {
    if (obj.hasOwnProperty(prop)
    && obj[prop] !== null
    && (typeof obj[prop] === "object" || typeof obj[prop] === "function")
    && !Object.isFrozen(obj[prop])) {
      deepFreeze(obj[prop]);
    }
  });
  return obj;
}

export class BacktestEngine {
  constructor(
    private pitEngine: PITEngine,
    private executionEngine: ExecutionEngine,
    private ledger: PortfolioLedger
  ) {}

  async runStep(timestamp: Date, strategy: Strategy, marketContextMap: Map<string, any>) {
    const universe = await this.pitEngine.getEligibleUniverse(timestamp, false);
    const rawPortfolio = this.ledger.getStateAsOf(timestamp);
    
    // ISOLATION: The strategy gets a detached, mathematically dead, deep-frozen clone of the portfolio
    const safePortfolio = deepFreeze(structuredClone(rawPortfolio));

    const context: StrategyContext = {
      timestamp: new Date(timestamp.getTime()),
      universe: Object.freeze([...universe]),
      portfolio: safePortfolio,
      getKnowledge: async (secId) => {
        return await this.pitEngine.getKnowledgeState(secId, timestamp);
      }
    };

    const orders = await strategy.generateOrders(context);
    let seq = this.ledger.getEvents().length;
    
    for (const order of orders) {
      this.ledger.append({
        id: `ord-${order.id}-${seq}`, timestamp, sequence: seq++, type: 'ORDER',
        orderId: order.id, securityId: order.securityId, side: order.side, orderQuantity: order.quantity
      });
    }

    // Process Market Fills based on Context
    for (const order of orders) {
      let remaining = order.quantity;
      const mktContext = marketContextMap.get(order.securityId);
      if (!mktContext) continue;
      
      let tick = timestamp.getTime();
      while (remaining > 0) {
        tick += 1000;
        const fillCtx = { ...mktContext, timestamp: new Date(tick) };
        const fill = this.executionEngine.processInterval(order, remaining, fillCtx);
        if (fill) {
          this.ledger.append({ id: fill.executionId, timestamp: fill.timestamp, sequence: seq++, type: 'EXECUTION', orderId: fill.orderId, fillQuantity: fill.quantity, price: fill.price });
          if (fill.fees > 0) {
            this.ledger.append({ id: `${fill.executionId}-fee`, timestamp: new Date(fill.timestamp.getTime() + 1), sequence: seq++, type: 'FEE', amount: fill.fees });
          }
          remaining -= fill.quantity;
        } else {
          break; // Market didn't support more fills
        }
      }
    }
  }

  // Bridging PIT Corporate Actions -> Ledger
  async processCorporateActions(timestamp: Date, securityId: string) {
    const knowledge = await this.pitEngine.getKnowledgeState(securityId, timestamp);
    if (!knowledge) return;
    const state = this.ledger.getStateAsOf(timestamp);
    let seq = this.ledger.getEvents().length;
    
    for (const ca of knowledge.corporateActions) {
      if (ca.exDate.getTime() <= timestamp.getTime() && !state.appliedCorporateActions.has(ca.id)) {
        if (ca.actionType === 'SPLIT') {
          this.ledger.append({ id: `ca-${ca.id}`, timestamp: ca.exDate, sequence: seq++, type: 'SPLIT', securityId: ca.securityId, corporateActionId: ca.id, ratio: ca.numerator! / ca.denominator! });
        } else if (ca.actionType === 'DIVIDEND') {
          this.ledger.append({ id: `ca-${ca.id}`, timestamp: ca.exDate, sequence: seq++, type: 'DIVIDEND', securityId: ca.securityId, corporateActionId: ca.id, amount: ca.amount! });
        }
      }
    }
  }
}
