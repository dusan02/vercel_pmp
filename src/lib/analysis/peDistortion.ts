/**
 * Detects a P/E distorted by temporarily depressed TTM earnings — the STM
 * case (P/E ≈ 308× because TTM EPS collapsed, not because the market
 * repriced the stock 20× richer). Such a multiple stops being meaningful
 * and must not be presented as plain "expensive".
 *
 * Triggers when the multiple is extreme in absolute terms (> 150) or sits
 * > 3× above the stock's own historical median P/E with a 60 floor (so a
 * small median alone can't trip it).
 */
export function isPeDistorted(
    pe: number | null | undefined,
    peMedian: number | null | undefined,
): boolean {
    if (pe == null || !Number.isFinite(pe) || pe <= 0) return false;
    if (pe > 150) return true;
    return peMedian != null && peMedian > 0 && pe > 60 && pe > 3 * peMedian;
}
