/**
 * Historical valuation stats — how today's multiple sits vs the stock's own
 * DailyValuationHistory (up to 10Y of daily rows written by
 * syncValuationHistory on our own TTM basis).
 *
 * `current` MUST be computed on the same basis as the stored series (our TTM
 * values from computeMetrics), otherwise the percentile answers a different
 * question — the MU bug: Finnhub's stale 129x ranked vs our ~5–50x history
 * produced percentile=100 and a "top 0%" label.
 */

export interface ValuationHistoryStat {
    /** Current multiple (same basis as the series), null when not computable. */
    current: number | null;
    min: number | null;
    max: number | null;
    median: number | null;
    /** Share of history strictly below current, 0–100. null without current/series. */
    percentile: number | null;
    sampleSize: number;
    /** Years covered by the series (max ~10). */
    years: number | null;
}

export interface ValuationHistoryStats {
    pe: ValuationHistoryStat;
    ps: ValuationHistoryStat;
    evEbit: ValuationHistoryStat;
    fcfYield: ValuationHistoryStat;
}

export interface ValuationHistoryRow {
    date: Date;
    peRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    fcfYield: number | null;
}

function median(sorted: number[]): number | null {
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1]! + sorted[mid]!) / 2
        : sorted[mid]!;
}

/** Summarize one series + rank `current` against it. */
export function summarizeSeries(
    values: number[],
    current: number | null,
    years: number | null,
): ValuationHistoryStat {
    const sorted = values.filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    if (sorted.length === 0) {
        return { current, min: null, max: null, median: null, percentile: null, sampleSize: 0, years };
    }
    let percentile: number | null = null;
    if (current != null && Number.isFinite(current)) {
        let below = 0;
        for (const v of sorted) if (v < current) below++;
        percentile = (below / sorted.length) * 100;
    }
    return {
        current,
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
        median: median(sorted),
        percentile,
        sampleSize: sorted.length,
        years,
    };
}

/** Build the four-metric stats block from daily rows (ascending by date). */
export function buildValuationHistory(
    rows: ValuationHistoryRow[],
    currents: { pe: number | null; ps: number | null; evEbit: number | null; fcfYield: number | null },
): ValuationHistoryStats {
    const years = rows.length >= 2
        ? (rows[rows.length - 1]!.date.getTime() - rows[0]!.date.getTime()) / (365.25 * 86_400_000)
        : null;
    const col = (pick: (r: ValuationHistoryRow) => number | null) =>
        rows.map(pick).filter((v): v is number => v != null);
    return {
        pe:       summarizeSeries(col(r => r.peRatio),   currents.pe,       years),
        ps:       summarizeSeries(col(r => r.psRatio),   currents.ps,       years),
        evEbit:   summarizeSeries(col(r => r.evEbitda),  currents.evEbit,   years),
        fcfYield: summarizeSeries(col(r => r.fcfYield),  currents.fcfYield, years),
    };
}
