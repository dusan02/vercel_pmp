/**
 * Liquidity gate for movers lists — a +433% move on a $0.00 stock with
 * 111 shares traded is noise, not a signal. Used by both the SSR
 * metadata layer (title/JSON-LD) and the client filter UI so they
 * always agree on what counts as a "main" mover.
 */
export const MIN_MOVER_PRICE = 5;
export const MIN_MOVER_DOLLAR_VOL = 1_000_000;

export interface MoverLiquidityInput {
  lastPrice: number | null;
  lastVolume: number | null;
}

export function isMicrocap(m: MoverLiquidityInput): boolean {
  const dollarVol = (m.lastVolume ?? 0) * (m.lastPrice ?? 0);
  return (m.lastPrice ?? 0) < MIN_MOVER_PRICE || dollarVol < MIN_MOVER_DOLLAR_VOL;
}
