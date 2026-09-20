/**
 * Detects corrupted sharesOutstanding values coming from the Finnhub XBRL
 * sync's EPS fallback (netIncome / EarningsPerShareDiluted). When the EPS
 * value lands in a mismatched filing context (YTD EPS, adjusted EPS, a
 * sub-line EPS), the derived share count is garbage — the signature is
 * netIncome / shares ≈ a small integer, i.e. the implied "EPS" is a round
 * number like exactly 1.00 or 7.00 (real EPS is almost never that clean).
 *
 * A second corroboration requires the stored count to deviate >30% from the
 * trusted current count (Ticker.sharesOutstanding) so a legitimately round
 * EPS on an unchanged share base doesn't false-positive.
 */
export function isSuspiciousShareCount(
    shares: number | null | undefined,
    netIncome: number | null | undefined,
    trustedShares: number | null | undefined,
): boolean {
    if (shares == null || shares <= 0 || netIncome == null || netIncome === 0) return false;
    if (trustedShares == null || trustedShares <= 0) return false;
    const impliedEps = netIncome / shares;
    const rounded = Math.round(impliedEps);
    if (rounded < 1 || rounded > 12) return false;
    if (Math.abs(impliedEps - rounded) > 0.005) return false;
    return Math.abs(shares / trustedShares - 1) > 0.3;
}
