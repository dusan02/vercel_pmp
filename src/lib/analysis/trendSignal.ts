/**
 * "Fundamentals confirm trend" signal — backtested combo:
 *   TTM revenue/share growth (1Y) > 30%
 *   AND TTM EPS growth (1Y) in (0, 300%)   — cap rejects near-zero-base EPS glitches
 *   AND price >= 80% of 52-week high        — momentum confirmation
 *   AND base TTM revenue >= $300M           — avoids zero-base P/S noise
 *   AND market cap >= $1B                   — backtest universe filter
 *
 * Backtested on 9 anchors (2023–2025): median forward return ~2× universe,
 * momentum-only or fundamentals-only alone were weaker than the combo.
 */
export interface TrendSignalPoint {
    date: Date | number;
    closePrice: number | null;
    psRatio: number | null;
    peRatio: number | null;
    marketCap?: number | null;
}

export interface TrendSignal {
    qualified: boolean;
    /** TTM revenue/share growth over ~1Y (fraction, e.g. 0.87 = +87%). */
    revG1y: number | null;
    /** TTM EPS growth over ~1Y (fraction); null when P/E invalid at either end. */
    epsG1y: number | null;
    /** Price as fraction of trailing 52-week high (0.91 = 91% of high). */
    pctOfHigh: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeTrendSignal(rows: TrendSignalPoint[]): TrendSignal | null {
    const pts = rows
        .filter(r => r.closePrice != null && r.closePrice > 0)
        .map(r => ({ ...r, t: r.date instanceof Date ? r.date.getTime() : (r.date as number) }))
        .sort((a, b) => a.t - b.t);
    if (pts.length < 2) return null;

    const now = pts[pts.length - 1]!;
    const target = now.t - 365 * DAY_MS;

    // Base row: closest to (now − 365d) within ±45d, must carry a valid P/S
    let base: typeof now | null = null;
    let bestDist = 45 * DAY_MS;
    for (const p of pts) {
        const d = Math.abs(p.t - target);
        if (d <= bestDist && p.psRatio != null && p.psRatio > 0) {
            bestDist = d;
            base = p;
        }
    }
    if (!base || !(now.psRatio != null && now.psRatio > 0)) return null;

    // Scale guard — revenue base must be meaningful, market cap >= $1B
    if (base.marketCap != null && base.marketCap > 0 && base.marketCap / base.psRatio! < 300e6) return null;
    if (now.marketCap != null && now.marketCap > 0 && now.marketCap < 1e9) return null;

    const revG1y = (now.closePrice! / now.psRatio!) / (base.closePrice! / base.psRatio!) - 1;
    if (!(revG1y > -1) || revG1y > 20) return null;

    let epsG1y: number | null = null;
    if (now.peRatio != null && now.peRatio > 0 && now.peRatio < 500 &&
        base.peRatio != null && base.peRatio > 0 && base.peRatio < 500) {
        epsG1y = (now.closePrice! / now.peRatio!) / (base.closePrice! / base.peRatio!) - 1;
    }

    let h52 = 0;
    const lo = now.t - 365 * DAY_MS;
    for (const p of pts) {
        if (p.t >= lo && p.closePrice! > h52) h52 = p.closePrice!;
    }
    const pctOfHigh = h52 > 0 ? now.closePrice! / h52 : null;

    const qualified = revG1y > 0.30
        && epsG1y != null && epsG1y > 0 && epsG1y < 3
        && pctOfHigh != null && pctOfHigh >= 0.80;

    const f = (v: number | null) => (v == null ? null : parseFloat(v.toFixed(4)));
    return { qualified, revG1y: f(revG1y), epsG1y: f(epsG1y), pctOfHigh: f(pctOfHigh) };
}
