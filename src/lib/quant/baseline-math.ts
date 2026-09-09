import { safeNum, safeAdd, safeSub, safeMul, safeDiv, safeAbs } from './safe-math';

const EPSILON = 0.01;

/**
 * Calculates YoY growth robustly, handling negative and zero denominators.
 * g_EPS = (EPS_t - EPS_{t-4}) / |EPS_{t-4}|
 */
export function safeGrowth(current: number, previous: number): number {
  const t = safeNum(current);
  let t4 = safeNum(previous);
  
  // Protect against division by zero
  if (t4 === 0) {
    t4 = EPSILON; 
  }

  const diff = safeSub(t, t4);
  const absT4 = safeAbs(t4);
  
  return safeDiv(diff, absT4);
}

/**
 * Calculates Earnings Acceleration (Change in Growth)
 * Acceleration = Growth_t - Growth_{t-4}
 */
export function safeAcceleration(currentGrowth: number, previousGrowth: number): number {
  return safeSub(currentGrowth, previousGrowth);
}

/**
 * Calculates Relative Strength against a benchmark return.
 * RS = Return_{stock} - Return_{benchmark}
 */
export function safeRelativeStrength(stockReturn: number, benchmarkReturn: number): number {
  return safeSub(stockReturn, benchmarkReturn);
}
