import type { TrancheLevelPlan, TrancheExecutionRow } from './dipEngine';

/**
 * Standard Normal Cumulative Distribution Function Φ(z)
 * Abramowitz & Stegun 26.2.17 polynomial approximation (error < 7.5e-8).
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return 0.5;
  if (z < -8) return 0;
  if (z > 8) return 1;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard Normal Probability Density Function φ(z)
 */
export function normalPdf(z: number): number {
  if (!Number.isFinite(z)) return 0;
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
}

/**
 * Pure function (usable both on backend and interactively on frontend) to compute
 * exact share counts, harmonic/weighted average price, gross/net profits, and
 * 15% tax vs 1-year time test / inverse ETF tax hedging.
 */
export function calculateWeightedTranches(params: {
  capitalUsd: number;
  targetPrice: number;
  levels: [TrancheLevelPlan, TrancheLevelPlan, TrancheLevelPlan];
  customEntryPrices?: [number?, number?, number?];
  taxRatePct?: number; // default 15%
}): {
  rows: TrancheExecutionRow[];
  totalAllocatedUsd: number;
  totalInvestedUsd: number;
  uninvestedCashUsd: number;
  finalWeightedAvgPrice: number;
  totalShares: number;
  hedgeSimulation: {
    positionValueAtTargetUsd: number;
    capitalNeededFor1xInverseUsd: number;
    capitalNeededFor3xInverseUsd: number;
  };
} {
  const { capitalUsd, targetPrice, levels, customEntryPrices, taxRatePct = 15 } = params;
  const safeCapital = Math.max(100, Number.isFinite(capitalUsd) ? capitalUsd : 15300);
  const taxRate = taxRatePct / 100;

  let cumulativeShares = 0;
  let cumulativeInvestedUsd = 0;
  const rows: TrancheExecutionRow[] = [];

  for (let idx = 0; idx < 3; idx++) {
    const lvl = levels[idx]!;
    const rawEntry = customEntryPrices?.[idx] ?? lvl.slaveEntryPrice;
    const entryPrice = Math.max(0.01, Number(rawEntry.toFixed(2)));
    const allocatedCapitalUsd = Number(((safeCapital * lvl.weightPct) / 100).toFixed(2));

    // Whole shares (celé kusy akcií)
    const sharesBought = Math.max(0, Math.floor(allocatedCapitalUsd / entryPrice));
    const actualInvestedUsd = Number((sharesBought * entryPrice).toFixed(2));

    cumulativeShares += sharesBought;
    cumulativeInvestedUsd = Number((cumulativeInvestedUsd + actualInvestedUsd).toFixed(2));

    const newWeightedAvgPrice =
      cumulativeShares > 0
        ? Number((cumulativeInvestedUsd / cumulativeShares).toFixed(2))
        : entryPrice;

    const totalExitValue = cumulativeShares * targetPrice;
    const grossProfitUsd = Number((totalExitValue - cumulativeInvestedUsd).toFixed(2));
    const grossReturnPct =
      cumulativeInvestedUsd > 0
        ? Number(((grossProfitUsd / cumulativeInvestedUsd) * 100).toFixed(2))
        : 0;

    const taxAmountUsd = grossProfitUsd > 0 ? grossProfitUsd * taxRate : 0;
    const netProfitAfter15PctTaxUsd = Number((grossProfitUsd - taxAmountUsd).toFixed(2));
    const netReturnAfter15PctTaxPct =
      cumulativeInvestedUsd > 0
        ? Number(((netProfitAfter15PctTaxUsd / cumulativeInvestedUsd) * 100).toFixed(2))
        : 0;

    rows.push({
      trancheNumber: lvl.trancheNumber,
      weightPct: lvl.weightPct,
      labelSk: lvl.labelSk,
      triggerConditionSk: lvl.triggerConditionSk,
      entryPrice,
      masterTriggerPrice: lvl.masterTriggerPrice,
      allocatedCapitalUsd,
      sharesBought,
      actualInvestedUsd,
      cumulativeShares,
      cumulativeInvestedUsd,
      newWeightedAvgPrice,
      grossProfitUsd,
      grossReturnPct,
      netProfitAfter15PctTaxUsd,
      netReturnAfter15PctTaxPct,
      netProfitTaxFree1YUsd: grossProfitUsd,
      taxSavedBy1YTestUsd: Number(taxAmountUsd.toFixed(2)),
    });
  }

  const positionValueAtTargetUsd = Number((cumulativeShares * targetPrice).toFixed(2));

  return {
    rows,
    totalAllocatedUsd: safeCapital,
    totalInvestedUsd: cumulativeInvestedUsd,
    uninvestedCashUsd: Number(Math.max(0, safeCapital - cumulativeInvestedUsd).toFixed(2)),
    finalWeightedAvgPrice:
      cumulativeShares > 0
        ? Number((cumulativeInvestedUsd / cumulativeShares).toFixed(2))
        : 0,
    totalShares: cumulativeShares,
    hedgeSimulation: {
      positionValueAtTargetUsd,
      capitalNeededFor1xInverseUsd: positionValueAtTargetUsd,
      capitalNeededFor3xInverseUsd: Number((positionValueAtTargetUsd / 3).toFixed(2)),
    },
  };
}
