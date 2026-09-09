import { PortfolioLedger, LedgerEvent, EventType } from './portfolio-ledger';

const EVENT_PRIORITY: Record<EventType, number> = {
  'SPLIT': 1, 'DIVIDEND': 1, 'TERMINAL_VALUE': 1,
  'DEPOSIT': 2, 'WITHDRAWAL': 2,
  'ORDER': 3,
  'EXECUTION': 4,
  'FEE': 5
};

export interface XIRRResult {
  rate: number;
  status: 'ROOT_FOUND' | 'NO_ROOT' | 'MULTIPLE_ROOTS';
  roots: number[];
}

export function strictXirr(cashflows: { amount: number; date: Date }[]): XIRRResult {
  if (cashflows.length < 2) return { rate: 0, status: 'NO_ROOT', roots: [] };
  
  const hasPos = cashflows.some(c => c.amount > 0);
  const hasNeg = cashflows.some(c => c.amount < 0);
  if (!hasPos || !hasNeg) return { rate: 0, status: 'NO_ROOT', roots: [] };

  const t0 = cashflows[0].date.getTime();
  const npv = (rate: number) => cashflows.reduce((sum, cf) => {
    const yf = (cf.date.getTime() - t0) / 31557600000; 
    return sum + cf.amount / Math.pow(1 + rate, yf);
  }, 0);

  const roots: number[] = [];
  const intervals: number[] = [];
  // Scan extensively up to 2000%
  for (let r = -0.99; r <= 20.0; r += 0.05) intervals.push(r);

  for (let i = 0; i < intervals.length - 1; i++) {
    let low = intervals[i], high = intervals[i+1];
    
    // Strict NPV zero or sign change bracket detection
    const npvLow = npv(low);
    const npvHigh = npv(high);
    
    if (npvLow * npvHigh <= 0) {
      let mid = 0;
      for (let j = 0; j < 50; j++) {
        mid = (low + high) / 2;
        const val = npv(mid);
        if (Math.abs(val) < 1e-7) break;
        if (npv(low) * val < 0) high = mid;
        else low = mid;
      }
      
      if (!roots.some(existing => Math.abs(existing - mid) < 1e-4)) {
        roots.push(mid);
      }
    }
  }

  if (roots.length === 0) return { rate: 0, status: 'NO_ROOT', roots };
  if (roots.length === 1) return { rate: roots[0], status: 'ROOT_FOUND', roots };
  
  return { rate: roots[0], status: 'MULTIPLE_ROOTS', roots };
}

export class PerformanceEngine {
  public static calculateTWR(
    ledger: PortfolioLedger, 
    timelineStart: Date,
    timelineEnd: Date,
    priceMap: (secId: string, t: Date) => number
  ): number {
    const events = ledger.getEvents().filter(e => e.timestamp > timelineStart && e.timestamp <= timelineEnd);
    
    // Strict SOP Event priority sorting for Cash flows on exact same timestamp
    const cfEvents = events.filter(e => e.type === 'DEPOSIT' || e.type === 'WITHDRAWAL')
                           .sort((a, b) => {
                             if (a.timestamp.getTime() !== b.timestamp.getTime()) return a.timestamp.getTime() - b.timestamp.getTime();
                             return (EVENT_PRIORITY[a.type] || 99) - (EVENT_PRIORITY[b.type] || 99);
                           });

    let twrFactor = 1.0;
    let previousNav = ledger.getStateAsOf(timelineStart).getNAV(new Map());

    for (const cf of cfEvents) {
      const preTime = new Date(cf.timestamp.getTime() - 1);
      const statePre = ledger.getStateAsOf(preTime);
      
      const pricesPre = new Map<string, number>();
      for (const secId of statePre.positions.keys()) pricesPre.set(secId, priceMap(secId, preTime));
      
      const navPre = statePre.getNAV(pricesPre);

      if (previousNav > 0) twrFactor *= (navPre / previousNav);
      
      const amount = cf.type === 'DEPOSIT' ? cf.amount! : -cf.amount!;
      previousNav = navPre + amount;
    }

    const stateEnd = ledger.getStateAsOf(timelineEnd);
    const pricesEnd = new Map<string, number>();
    for (const secId of stateEnd.positions.keys()) pricesEnd.set(secId, priceMap(secId, timelineEnd));
    const finalNav = stateEnd.getNAV(pricesEnd);

    if (previousNav > 0) twrFactor *= (finalNav / previousNav);

    return twrFactor - 1.0;
  }
}
