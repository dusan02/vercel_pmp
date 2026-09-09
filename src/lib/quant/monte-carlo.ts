import { SlippageModel, MarketContext, ExecutionEngine, Order, ExecutionFill } from './execution-engine';
import { Side } from './portfolio-ledger';

export function createSeededRNG(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class MCSlippageModel implements SlippageModel {
  constructor(
    private rng: () => number,
    private totalSpreadBps: number,
    private slippageStdDevBps: number
  ) {}

  getExecutionPrice(side: Side, quantity: number, context: MarketContext): number {
    // We start from a pristine reference mid to absolutely prevent double-counting
    const mid = context.referenceMid;
    
    // Mathematically clean half-spread
    const halfSpreadImpact = mid * ((this.totalSpreadBps / 2) / 10000);
    let executablePrice = side === 'BUY' ? mid + halfSpreadImpact : mid - halfSpreadImpact;

    if (this.slippageStdDevBps > 0) {
      let u1 = 0, u2 = 0;
      while (u1 === 0) u1 = this.rng(); 
      while (u2 === 0) u2 = this.rng();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const slipImpact = z * (this.slippageStdDevBps / 10000) * executablePrice;
      
      // Add standard normal friction
      executablePrice += slipImpact;
    }

    return executablePrice;
  }
}
