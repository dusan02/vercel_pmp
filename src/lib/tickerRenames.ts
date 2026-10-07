/**
 * Polygon ticker-reuse handling for daily aggregates.
 *
 * Polygon keys price history by ticker+period, so a renamed ticker's series
 * contains whatever instrument held the symbol earlier — META aggs for
 * 2021–22 return the ~$15 Roundhill Metaverse ETF, not Meta Platforms, and
 * the series jumps 14× the day the ticker's company switches (2022-06-09).
 * DailyValuationHistory was repaired in place (scripts/repair-renamed-ticker-history.ts);
 * the candles API fetches Polygon live, so it sanitizes here instead:
 *
 *   1. Detector — a >5× (or <0.35×) adjacent-day jump that does not revert
 *      is a foreign-instrument boundary. 5×/day doesn't happen for real
 *      stocks (GME's squeeze peaked ~2.4×/day; UPST's real crash was −56%);
 *      META/BNY boundaries printed 13–14×.
 *   2. Table — silent collisions escape the detector (Barnes→Barrick ~0.5×,
 *      SAIL IPO 0.38×) so known tickers also carry validFrom, the first day
 *      the current ticker means this company.
 *   3. Source — renamed companies keep their real back-history under the
 *      OLD ticker (FB/BK/IIVI/GOLD all verified live on Polygon), which we
 *      splice in so a 5Y chart stays 5Y instead of starting at the rename.
 */

export interface TickerRename {
  /** Old ticker still holding this company's pre-rename history. null = the
      symbol collided with an unrelated instrument and there is no old ticker
      (IPO into a reused symbol — truncate only). */
  source: string | null;
  /** First date (YYYY-MM-DD) the current ticker = this company. Only needed
      where the transition is too smooth for the jump detector. */
  validFrom?: string;
}

export const TICKER_RENAMES: Record<string, TickerRename> = {
  META: { source: 'FB', validFrom: '2022-06-09' },   // FB→META
  COHR: { source: 'IIVI', validFrom: '2022-09-08' }, // II-VI→Coherent
  B: { source: 'GOLD', validFrom: '2025-05-09' },    // Barrick GOLD→B (silent ~0.5×)
  BNY: { source: 'BK', validFrom: '2025-06-24' },    // BK→BNY (Polygon flipped late: 2026-05-21)
  QXO: { source: 'SSUN' },                           // SilverSun→QXO — detector-only today
  FIG: { source: null, validFrom: '2025-07-31' },    // Figma IPO — prior FIG = foreign
  SAIL: { source: null, validFrom: '2025-02-13' },   // SailPoint IPO — prior SAIL = foreign
  SPCX: { source: null },                            // detector-only (7.3× 2026-06-12)
};

/**
 * Index of the first bar that belongs to the CURRENT instrument, or -1 when
 * the series looks clean. Contamination is always a prefix — the first
 * non-reverting extreme jump marks where the real instrument begins, so the
 * first qualifying jump is the boundary (a later real crash must never
 * truncate valid history, and it can't reach the threshold anyway).
 */
export function findForeignBoundary(aggs: { t: number; c: number }[]): number {
  const extreme = (a: number, b: number) => {
    if (!(a > 0) || !(b > 0)) return false;
    const r = b / a;
    return r > 5 || r < 0.35;
  };
  let boundary = -1;
  for (let i = 1; i < aggs.length; i++) {
    const prev = aggs[i - 1]!.c;
    const cur = aggs[i]!.c;
    if (!extreme(prev, cur)) continue;
    // A jump in the last few bars can't be a series boundary worth acting
    // on — dropping the whole history for it would be destructive.
    if (i >= aggs.length - 3) continue;
    // Not a regime change but a one-bar bad print when either neighbour pair
    // is also extreme (0.001 blip between two normal bars trips BOTH legs).
    if (i >= 2 && extreme(aggs[i - 2]!.c, prev)) continue;   // prev is the blip
    if (i < aggs.length - 1 && extreme(cur, aggs[i + 1]!.c)) continue; // cur reverts
    // Foreign prefixes can contain internal jumps; the LAST boundary marks
    // where the current instrument starts — everything after it is real.
    boundary = i;
  }
  return boundary;
}

/**
 * Cutoff timestamp (ms): bars before this are a foreign instrument. Combines
 * the empirical boundary (jump detector) with the documented rename date —
 * Polygon sometimes flips the series months late (BNY: renamed 2025-06-24,
 * foreign bars until 2026-05-21) so the later of the two wins.
 * Returns null when the series is clean.
 */
export function foreignCutoffMs(
  symbol: string,
  aggs: { t: number; c: number }[],
): number | null {
  const boundaryIdx = findForeignBoundary(aggs);
  const rename = TICKER_RENAMES[symbol];
  const detected = boundaryIdx >= 0 ? aggs[boundaryIdx]!.t : null;
  const declared = rename?.validFrom ? Date.parse(`${rename.validFrom}T00:00:00Z`) : null;
  const cutoff = Math.max(detected ?? -Infinity, declared ?? -Infinity);
  return Number.isFinite(cutoff) ? cutoff : null;
}

/**
 * Splice safety: old-ticker history only stitches when the join is
 * continuous — the same company can't gap more than 2× across its rename.
 * META 196.64→175.57, IIVI 41.95→44.23, BK 137.16→139.15 all pass.
 */
export function spliceContinuous(lastSourceClose: number, firstKeptClose: number): boolean {
  if (!(lastSourceClose > 0) || !(firstKeptClose > 0)) return false;
  const r = firstKeptClose / lastSourceClose;
  return r > 0.5 && r < 2;
}
