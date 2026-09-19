'use client';

import React, { useMemo } from 'react';
import { AnalysisData, ValuationHistoryStat } from './types';
import { MetricCardDef, StatusType, StatusBadge, VALUE_COLORS } from '../shared/MetricCard';

function ordinalSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th');
}

/** Tooltip suffix: "10Y range 5.5x–50.1x · 72nd percentile" (own TTM basis). */
function histTip(stat: ValuationHistoryStat | undefined, unit: 'x' | '%'): string {
    if (!stat || stat.percentile == null || stat.min == null || stat.max == null) return '';
    const f = (v: number) => unit === '%'
        ? `${(Math.abs(v * 100) < 0.05 ? 0 : v * 100).toFixed(1)}%`
        : `${v.toFixed(1)}x`;
    const yrs = stat.years != null && stat.years >= 1 ? `${Math.round(stat.years)}Y` : 'hist.';
    const p = stat.percentile;
    const pctText = p >= 99 ? 'highest in history' : p <= 1 ? 'lowest in history' : `${ordinalSuffix(Math.round(p))} pct`;
    return ` — vs own ${yrs} history: ${f(stat.min)}–${f(stat.max)} · ${pctText}`;
}

interface EwScoreInput {
    totalScore: number | null;
    maxPossible: number | null;
    rank: number | null;
    asOfDate: Date | string | null;
}

interface Props {
    data: AnalysisData;
    /** Early Winners snapshot — renders as a minimal cell in the Scores group */
    ewScore?: EwScoreInput | null | undefined;
}

// ── Build all metrics — every flow metric shares the same TTM as-of period ───
export function buildMetrics(data: AnalysisData, ewScore?: Props['ewScore']) {
    const m = data.metrics;
    const bs = data.balanceSheet;
    const mcap = data.ticker?.lastMarketCap ? data.ticker.lastMarketCap * 1e9 : null;

    const pct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : 'N/A';
    const yr  = (v: number | null | undefined) => v != null ? (v === 0 ? 'Net Cash' : `${v.toFixed(1)}y`) : 'N/A';
    const mul = (v: number | null | undefined, d = 2) => v != null ? `${v.toFixed(d)}x` : 'N/A';

    function fmtB(val: number | null | undefined): string {
        if (val == null) return 'N/A';
        const absVal = Math.abs(val);
        if (absVal >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
        if (absVal >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
        if (absVal >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
        return `$${val.toFixed(0)}`;
    }

    const ttm = data.ttm;
    const fh = data.finnhub;
    const hasNegEquity = bs?.totalEquity != null && bs.totalEquity <= 0;

    // One consistent source per metric family: when our normalized statements
    // are fresh (<= ~5 months), our own TTM/snapshot math wins so every row
    // shares the same as-of period. Finnhub fills gaps and covers tickers whose
    // statements are stale — its snapshot can be newer than our last sync.
    const STMT_FRESH_MS = 150 * 86_400_000;
    const stmtAge = (stmts: typeof data.statements) => {
        const d = stmts?.[0]?.endDate ? new Date(stmts[0].endDate).getTime() : NaN;
        return Number.isNaN(d) ? Infinity : Date.now() - d;
    };
    const fresh = stmtAge(data.statements) < STMT_FRESH_MS;
    const pick = <T,>(ours: T | null, fhVal: T | null): T | null =>
        fresh ? (ours ?? fhVal) : (fhVal ?? ours);

    // ROE: own TTM when statements are fresh, else Finnhub (returns %).
    // If equity is negative, ROE is misleading — show 'Neg. Equity' instead
    const ourRoe = (ttm?.netIncome != null && bs?.totalEquity != null && bs.totalEquity > 0) ? ttm.netIncome / bs.totalEquity : null;
    const roe = hasNegEquity ? null : pick(ourRoe, fh?.roe != null ? fh.roe / 100 : null);
    const ourNm = (ttm?.netIncome != null && ttm?.revenue != null && ttm.revenue > 0) ? ttm.netIncome / ttm.revenue : null;
    const netMar = pick(ourNm, fh?.netMargin != null ? fh.netMargin / 100 : null);
    const ourGm = (ttm?.grossProfit != null && ttm?.revenue != null && ttm.revenue > 0) ? ttm.grossProfit / ttm.revenue : null;
    const grossMar = pick(ourGm, fh?.grossMargin != null ? fh.grossMargin / 100 : null);
    // P/B, P/S: same source rule. Negative equity makes P/B meaningless —
    // a distorted P/B could satisfy "< 3" and earn a green badge.
    const ourPb = (mcap != null && bs?.totalEquity != null && bs.totalEquity > 0) ? mcap / bs.totalEquity : null;
    const pbRatio = hasNegEquity ? null : pick(ourPb, fh?.pbRatio ?? null);
    const ourPs = (mcap != null && ttm?.revenue != null && ttm.revenue > 0) ? mcap / ttm.revenue : null;
    const psRatio = pick(m?.psRatio ?? ourPs, fh?.psRatio ?? null);

    const altZ   = m?.altmanZ ?? m?.zScore ?? null;
    const debtRp = m?.debtRepaymentYears ?? m?.debtRepaymentTime ?? null;
    const intCov = fh?.interestCoverage ?? data.interestCoverage ?? null;
    const cr     = pick(bs?.currentRatio ?? null, fh?.currentRatio ?? null);
    const nde    = bs?.netDebtToEbit ?? null;
    const dte    = pick(bs?.debtToEquity ?? null, fh?.debtEquityRatio ?? null);
    const cashDebt = (bs?.cash != null && bs?.totalDebt != null && bs.totalDebt > 0) ? bs.cash / bs.totalDebt : (bs?.totalDebt === 0 ? Infinity : null);
    const fcfMar = m?.fcfMargin ?? null;
    const fcfCon = m?.fcfConversion ?? null;
    const rCagr  = data.revenueCagr ?? null;
    const niCagr = data.netIncomeCagr ?? null;
    const pe     = m?.currentPe ?? null;
    const fcfY   = m?.fcfYield ?? null;
    const pio    = data.piotroskiScore ?? null;
    const ben    = data.beneishScore ?? null;
    const mv     = data.marginStability ?? null;
    const niYrs  = data.negativeNiYears ?? 0;
    const dil    = bs?.dilution5y;
    const sbc    = bs?.sbcRatio;
    // ROIC — Finnhub's roicTTM is a premium field (never populated on our
    // tier), so compute it: NOPAT (EBIT × (1 − 21% statutory)) / invested
    // capital (equity + debt − cash). Finnhub value stays as fallback.
    const investedCap = (bs?.totalEquity ?? 0) + (bs?.totalDebt ?? 0) - (bs?.cash ?? 0);
    const ourRoic = (ttm?.ebit != null && investedCap > 0) ? (ttm.ebit * 0.79) / investedCap : null;
    const roic = pick(ourRoic, fh?.roic != null ? fh.roic / 100 : null);
    // Forward P/E sanity-guarded the same way computeMetrics does (junk <1
    // values appear for illiquid names)
    const fpe = fh?.forwardPe != null && fh.forwardPe >= 1 ? fh.forwardPe : null;
    // EV/EBIT: own TTM value (D&A not in our data → EBIT, not EBITDA). Finnhub's
    // EV/EBITDA fills the gap but stays labeled as its own metric.
    const evEbit = m?.evEbit ?? null;
    const evEbitda = evEbit ?? fh?.evEbitda ?? null;
    const evLabel = evEbit != null ? 'EV/EBIT' : 'EV/EBITDA';
    const vh = data.valuationHistoryStats;
    // Finnhub's PEG derives from their own P/E basis. When their P/E diverges
    // >2× from our displayed TTM P/E, their PEG answers a different question —
    // showing it next to our P/E would be internally contradictory.
    const fhPe = fh?.peRatio ?? null;
    const peDivergent = fhPe != null && pe != null && pe > 0 && (fhPe / pe > 2 || fhPe / pe < 0.5);
    const peg = !peDivergent ? (fh?.pegRatio ?? null) : null;

    // Flow metrics — all TTM, one as-of period. Using the sankey period here
    // once produced a contradiction: FCF margin 29% (TTM) next to True FCF
    // 1.9% (last FY, a capex-heavy year). Same basis for every row now.
    const ttmRev = ttm?.revenue ?? null;
    const ttmOcf = ttm?.operatingCashFlow ?? null;
    const ttmCapex = ttm?.capex ?? null;
    const ttmSbc = ttm?.sbc ?? null;
    const safeDiv = (num: number | null | undefined, den: number | null | undefined) =>
        num != null && den != null && den > 0 ? num / den : null;
    const opMargin = safeDiv(ttm?.ebit, ttmRev);
    const trueFcfM = (ttmOcf != null && ttmCapex != null)
        ? safeDiv(ttmOcf - Math.abs(ttmCapex) - (ttmSbc ?? 0), ttmRev) : null;
    const capexRev = ttmCapex != null ? safeDiv(Math.abs(ttmCapex), ttmRev) : null;
    const sbcRev = safeDiv(ttmSbc, ttmRev);

    const def = (
        label: string, value: string,
        statusType: StatusType, statusLabel: string, hint: string
    ): MetricCardDef => ({ label, value, statusType, statusLabel, hint });

    // Prefer read-time pillar scores (single snapshot, matches the radar);
    // stored AnalysisCache values are the fallback until a refresh runs.
    const p = data.pillars ?? null;
    const healthVal = p?.health.score ?? data.healthScore;
    const profVal = p?.profitability.score ?? data.profitabilityScore;
    const valVal = p?.valuation.score ?? data.valuationScore;
    const growthVal = p?.growth.score ?? null;
    const qualityVal = p?.quality.score ?? null;
    const scoreBand = (v: number | null | undefined) =>
        v == null ? 'neutral' as StatusType : v >= 75 ? 'good' : v >= 50 ? 'warn' : 'bad';
    const scoreWord = (v: number | null | undefined) =>
        v == null ? '-' : v >= 75 ? 'Strong' : v >= 50 ? 'Moderate' : 'Weak';

    const scores: MetricCardDef[] = [
        def('Valuation', valVal != null ? `${valVal.toFixed(0)}/100` : 'N/A',
            scoreBand(valVal), scoreWord(valVal),
            'How attractively the stock is priced vs fundamentals and own history'),
        ...(growthVal != null ? [def('Growth', `${growthVal.toFixed(0)}/100`,
            scoreBand(growthVal), scoreWord(growthVal),
            'Revenue/NI/EPS CAGR + forward implied growth')] : []),
        def('Profitability', profVal != null ? `${profVal.toFixed(0)}/100` : 'N/A',
            scoreBand(profVal), scoreWord(profVal),
            'Margins and returns on capital: ROIC, ROE, net & operating margin'),
        def('Health', healthVal != null ? `${healthVal.toFixed(0)}/100` : 'N/A',
            scoreBand(healthVal), scoreWord(healthVal),
            'Balance-sheet strength: Altman Z, liquidity, interest burden, net cash/debt'),
        ...(qualityVal != null ? [def('Quality', `${qualityVal.toFixed(0)}/100`,
            scoreBand(qualityVal), scoreWord(qualityVal),
            'Earnings quality: Piotroski, Beneish, FCF conversion, margin stability')] : []),
        // Early Winners composite — minimal numeric cell (the rail card's
        // full breakdown lives on /screener/early-winners)
        ...(ewScore?.totalScore != null && ewScore?.maxPossible != null && ewScore.maxPossible > 0 ? [(() => {
            const ratio = ewScore.totalScore! / ewScore.maxPossible!;
            const asOf = ewScore.asOfDate ? new Date(ewScore.asOfDate).toISOString().slice(0, 10) : null;
            return def(
                'EW Score',
                `${Number(ewScore.totalScore!.toFixed(1))}/${Number(ewScore.maxPossible!.toFixed(0))}`,
                ratio >= 0.6 ? 'good' : ratio >= 0.45 ? 'warn' : 'neutral',
                ewScore.rank != null ? `#${ewScore.rank}` : '-',
                `Early Winners composite (V5-B, current data) — fundamentals + momentum + quality; earnings pillar excluded (no point-in-time consensus).${ewScore.rank != null ? ` Rank #${ewScore.rank} in the universe.` : ''}${asOf ? ` As of ${asOf}.` : ''} Full breakdown: /screener/early-winners`,
            );
        })()] : []),
    ];

    const valuation: MetricCardDef[] = [
        def('Market Cap', fmtB(mcap), 'neutral', '-', 'Current Market Capitalization'),
        def('P/E (TTM)', pe != null ? `${pe.toFixed(1)}x` : 'N/A', pe == null ? 'neutral' : pe < 15 ? 'good' : pe <= 25 ? 'neutral' : pe <= 35 ? 'warn' : 'bad', pe == null ? '-' : pe < 15 ? 'Cheap' : pe <= 25 ? 'Fair' : 'Exp.', `Price / TTM EPS (own statements)${histTip(vh?.pe, 'x')}`),
        def('Forward P/E', fpe != null ? `${fpe.toFixed(1)}x` : 'N/A', fpe == null ? 'neutral' : fpe < 15 ? 'good' : fpe <= 25 ? 'neutral' : fpe <= 35 ? 'warn' : 'bad', fpe == null ? '-' : fpe < 15 ? 'Cheap' : fpe <= 25 ? 'Fair' : 'Exp.', 'Price / next-year EPS estimate — shows whether the TTM multiple is rich or just front-loading growth'),
        def(evLabel, evEbitda != null ? `${evEbitda.toFixed(1)}x` : 'N/A', evEbitda == null ? 'neutral' : evEbitda < 12 ? 'good' : evEbitda <= 18 ? 'neutral' : evEbitda <= 25 ? 'warn' : 'bad', evEbitda == null ? '-' : evEbitda < 12 ? 'Cheap' : evEbitda <= 18 ? 'Fair' : 'Exp.', `Enterprise value / ${evEbit != null ? 'TTM EBIT (D&A not in our data)' : 'EBITDA (Finnhub)'} — capital-structure neutral${histTip(vh?.evEbit, 'x')}`),
        def('P/S (TTM)', psRatio != null ? `${psRatio.toFixed(2)}x` : 'N/A', psRatio == null ? 'neutral' : psRatio < 2 ? 'good' : psRatio <= 5 ? 'neutral' : psRatio <= 10 ? 'warn' : 'bad', psRatio == null ? '-' : psRatio < 2 ? 'Cheap' : psRatio <= 5 ? 'Fair' : 'Exp.', `Price / TTM Revenue (own statements)${histTip(vh?.ps, 'x')}`),
        def('P/B Ratio', pbRatio != null ? mul(pbRatio) : (hasNegEquity ? 'Neg. Equity' : 'N/A'), pbRatio == null ? (hasNegEquity ? 'warn' : 'neutral') : pbRatio < 3 ? 'good' : pbRatio < 8 ? 'warn' : 'bad', pbRatio == null ? (hasNegEquity ? 'Buybacks' : '-') : pbRatio < 3 ? 'Fair' : pbRatio < 8 ? 'Exp.' : 'V.Exp.', 'Price to Book Value. Neg. equity = heavy buybacks'),
        def('FCF Yield', pct(fcfY), fcfY == null ? 'neutral' : fcfY > 0.05 ? 'good' : fcfY < 0 ? 'bad' : 'warn', fcfY == null ? '-' : fcfY > 0.05 ? 'Value' : fcfY < 0 ? 'Negative' : 'Low', `TTM FCF / Market Cap${histTip(vh?.fcfYield, '%')}`),
        def('PEG Ratio', peg != null ? `${peg.toFixed(2)}` : 'N/A', peg == null ? 'neutral' : peg < 1 ? 'good' : peg <= 2 ? 'neutral' : peg <= 3 ? 'warn' : 'bad', peg == null ? '-' : peg < 1 ? 'Cheap' : peg <= 2 ? 'Fair' : 'Exp.', 'Finnhub PEG — their P/E basis ÷ expected EPS growth. Suppressed when their P/E diverges >2× from our TTM P/E (different basis)'),
    ];

    const profitability: MetricCardDef[] = [
        def('ROIC', roic != null ? pct(roic) : 'N/A', roic == null ? 'neutral' : roic > 0.15 ? 'good' : roic > 0.08 ? 'warn' : 'bad', roic == null ? '-' : roic > 0.15 ? 'Moat' : roic > 0.08 ? 'Avg' : 'Low', 'NOPAT (EBIT less ~21% tax) / invested capital (equity + debt − cash). Flagship quality metric — durable >15% signals a moat'),
        def('ROE', roe != null ? pct(roe) : (hasNegEquity ? 'Neg. Equity' : 'N/A'), roe == null ? (hasNegEquity ? 'warn' : 'neutral') : roe > 0.20 ? 'good' : roe > 0.10 ? 'warn' : 'bad', roe == null ? (hasNegEquity ? 'Buybacks' : '-') : roe > 0.2 ? 'Strong' : roe > 0.1 ? 'Avg' : 'Weak', 'Return on Equity. Neg. equity = heavy buybacks'),
        def('Gross Margin', pct(grossMar), grossMar == null ? 'neutral' : grossMar > 0.50 ? 'good' : grossMar > 0.30 ? 'warn' : 'bad', grossMar == null ? '-' : grossMar > 0.5 ? 'Premium' : grossMar > 0.3 ? 'Avg' : 'Low', 'Gross Profit / Revenue'),
        def('Operating Margin', pct(opMargin), opMargin == null ? 'neutral' : opMargin > 0.25 ? 'good' : opMargin > 0.10 ? 'warn' : 'bad', opMargin == null ? '-' : opMargin > 0.25 ? 'High' : opMargin > 0.10 ? 'Avg' : 'Low', 'TTM EBIT / TTM Revenue'),
        def('Net Margin', pct(netMar), netMar == null ? 'neutral' : netMar > 0.10 ? 'good' : netMar > 0.05 ? 'warn' : 'bad', netMar == null ? '-' : netMar > 0.1 ? 'High' : netMar > 0.05 ? 'Avg' : 'Low', 'Net Income / Revenue'),
        def('FCF Margin', pct(fcfMar), fcfMar == null ? 'neutral' : fcfMar > 0.15 ? 'good' : fcfMar > 0.08 ? 'warn' : 'bad', fcfMar == null ? '-' : fcfMar > 0.15 ? 'High' : fcfMar > 0.08 ? 'Avg' : 'Low', 'FCF / Revenue'),
        def('FCF Conversion', pct(fcfCon), fcfCon == null ? 'neutral' : fcfCon > 0.80 ? 'good' : fcfCon > 0.50 ? 'warn' : 'bad', fcfCon == null ? '-' : fcfCon > 0.8 ? 'Strong' : fcfCon > 0.5 ? 'Avg' : 'Poor', 'FCF / Net Income'),
        def('True FCF Margin', pct(trueFcfM), trueFcfM == null ? 'neutral' : trueFcfM > 0.12 ? 'good' : trueFcfM > 0.05 ? 'warn' : 'bad', trueFcfM == null ? '-' : trueFcfM > 0.12 ? 'High' : trueFcfM > 0.05 ? 'Avg' : 'Low', 'TTM (OCF − CapEx − SBC) / TTM Revenue — SBC treated as a real cost'),
    ];

    const growth: MetricCardDef[] = [
        def('Revenue CAGR', rCagr != null ? `${rCagr.toFixed(1)}%` : 'N/A', rCagr == null ? 'neutral' : rCagr > 15 ? 'good' : rCagr > 5 ? 'warn' : 'bad', rCagr == null ? '-' : rCagr > 15 ? 'High' : rCagr > 5 ? 'Ok' : 'Low', 'Compound annual revenue growth (up to 5Y depending on data availability)'),
        def('Net Income CAGR', niCagr != null ? `${niCagr.toFixed(1)}%` : 'N/A', niCagr == null ? 'neutral' : niCagr > 15 ? 'good' : niCagr > 5 ? 'warn' : 'bad', niCagr == null ? '-' : niCagr > 15 ? 'High' : niCagr > 5 ? 'Ok' : 'Low', 'Compound annual net income growth (up to 5Y depending on data availability)'),
        def('Dilution (5Y)', dil != null ? `${dil > 0 ? '+' : ''}${dil.toFixed(1)}%` : 'N/A', dil == null ? 'neutral' : dil < -2 ? 'good' : dil <= 2 ? 'neutral' : dil <= 10 ? 'warn' : 'bad', dil == null ? '-' : dil < -2 ? 'Buybacks' : dil <= 2 ? 'Flat' : 'Dilutive', 'Share count change over 5Y'),
        def('SBC / Net Income', sbc != null ? `${sbc.toFixed(1)}%` : 'N/A', sbc == null ? 'neutral' : sbc < 10 ? 'good' : sbc < 20 ? 'warn' : 'bad', sbc == null ? '-' : sbc < 10 ? 'Low' : sbc < 20 ? 'Med' : 'High', 'Stock-based comp/Net income. >30% = dilution risk'),
        def('SBC / Revenue', pct(sbcRev), sbcRev == null ? 'neutral' : sbcRev < 0.03 ? 'good' : sbcRev < 0.08 ? 'warn' : 'bad', sbcRev == null ? '-' : sbcRev < 0.03 ? 'Low' : sbcRev < 0.08 ? 'Med' : 'High', 'TTM stock-based comp / TTM Revenue'),
    ];

    const solvency: MetricCardDef[] = [
        def('Altman Z-Score', altZ != null ? altZ.toFixed(2) : 'N/A', altZ == null ? 'neutral' : altZ > 3 ? 'good' : altZ < 1.8 ? 'bad' : 'warn', altZ == null ? '-' : altZ > 3 ? 'Safe' : altZ < 1.8 ? 'Distress' : 'Gray zone', 'Bankruptcy risk. >3 Safe, <1.8 Distress'),
        def('Interest Coverage', intCov != null ? `${intCov.toFixed(1)}x` : 'N/A', intCov == null ? 'neutral' : intCov > 10 ? 'good' : intCov > 3 ? 'warn' : 'bad', intCov == null ? '-' : intCov > 10 ? 'Strong' : intCov > 3 ? 'Ok' : 'Risky', 'EBIT/Interest. >10 Strong'),
        def('Net Debt/EBIT', nde != null ? (nde < 0 ? 'Net Cash' : `${nde.toFixed(1)}x`) : 'N/A', nde == null ? 'neutral' : nde < 4 ? (nde < 2 ? 'good' : 'warn') : 'bad', nde == null ? '-' : nde < 2 ? 'Low' : nde < 4 ? 'Med' : 'High', 'Leverage. <2x Low, >4x High'),
        def('Debt/Equity', dte != null ? `${dte.toFixed(2)}x` : 'N/A', dte == null ? 'neutral' : dte < 1 ? 'good' : dte < 2 ? 'warn' : 'bad', dte == null ? '-' : dte < 1 ? 'Low' : dte < 2 ? 'Med' : 'High', '<1 Conservative, >2 Risky'),
        def('Current Ratio', mul(cr), cr == null ? 'neutral' : cr > 2 ? 'good' : cr > 1 ? 'warn' : 'bad', cr == null ? '-' : cr > 2 ? 'High' : cr > 1 ? 'Ok' : 'Low', 'Current Assets/Liabilities'),
        def('Cash / Debt', cashDebt === Infinity ? 'No Debt' : cashDebt != null ? `${cashDebt.toFixed(2)}x` : 'N/A', cashDebt == null ? 'neutral' : cashDebt === Infinity || cashDebt >= 1 ? 'good' : cashDebt >= 0.3 ? 'warn' : 'bad', cashDebt == null ? '-' : cashDebt === Infinity ? 'Clean' : cashDebt >= 1 ? 'Covered' : cashDebt >= 0.3 ? 'Partial' : 'Thin', 'Cash covers how much of total debt. >1 = could repay all debt from cash'),
        def('Debt Repayment', yr(debtRp), debtRp == null ? 'neutral' : debtRp <= 3 ? 'good' : debtRp > 10 ? 'bad' : 'warn', debtRp == null ? '-' : debtRp <= 3 ? 'Fast' : debtRp > 10 ? 'Slow' : 'Avg', 'Years to repay net debt via FCF'),
    ];

    const quality: MetricCardDef[] = [
        def('Piotroski F-Score', pio != null ? `${pio}/9` : 'N/A', pio == null ? 'neutral' : pio >= 7 ? 'good' : pio >= 4 ? 'warn' : 'bad', pio == null ? '-' : pio >= 7 ? 'Strong' : pio >= 4 ? 'Avg' : 'Weak', 'Financial strength 0–9. >7 Strong'),
        def('Beneish M-Score', ben != null ? ben.toFixed(2) : 'N/A', ben == null ? 'neutral' : ben < -2.22 ? 'good' : ben < -1.78 ? 'warn' : 'bad', ben == null ? '-' : ben < -2.22 ? 'Safe' : ben < -1.78 ? 'Gray zone' : 'Risky', 'Earnings manipulation risk. < -2.22 Safe'),
        def('Margin Volatility', mv != null ? `${(mv * 100).toFixed(1)}%` : 'N/A', mv == null ? 'neutral' : mv < 0.08 ? 'good' : mv < 0.15 ? 'warn' : 'bad', mv == null ? '-' : mv < 0.08 ? 'Stable' : mv < 0.15 ? 'Avg' : 'Volatile', 'EBIT margin std deviation. Lower = stable'),
        def('Capex / Revenue', pct(capexRev), capexRev == null ? 'neutral' : capexRev < 0.05 ? 'good' : capexRev < 0.15 ? 'warn' : 'bad', capexRev == null ? '-' : capexRev < 0.05 ? 'Asset-light' : capexRev < 0.15 ? 'Avg' : 'Heavy', 'TTM CapEx / TTM Revenue — high % = capital-hungry business'),
    ];

    const balanceSheet: MetricCardDef[] = [
        def('Total Debt', fmtB(bs?.totalDebt), 'neutral', '-', 'Total debt obligations (short + long term)'),
        def('Cash & Equiv.', fmtB(bs?.cash), 'neutral', '-', 'Cash and short-term investments'),
        def('Net Debt', fmtB(bs?.netDebt), bs?.netDebt != null && bs.netDebt < 0 ? 'good' : 'neutral', bs?.netDebt != null && bs.netDebt < 0 ? 'Net Cash' : '-', 'Total Debt minus Cash. Negative = Net Cash position'),
        def('Total Equity', fmtB(bs?.totalEquity), 'neutral', '-', "Shareholders' equity (book value)"),
        def('Asset / Liability', bs?.assetToLiability != null ? `${bs.assetToLiability.toFixed(2)}x` : 'N/A', bs?.assetToLiability == null ? 'neutral' : bs.assetToLiability >= 2 ? 'good' : bs.assetToLiability >= 1 ? 'warn' : 'bad', bs?.assetToLiability == null ? '-' : bs.assetToLiability >= 2 ? 'Solid' : bs.assetToLiability >= 1 ? 'Adequate' : 'Risky', 'Total Assets / Total Liabilities'),
    ];

    return { scores, valuation, profitability, growth, solvency, quality, balanceSheet, lossYears: niYrs };
}

// ── Dense metric cell — Finviz-style label:value pair ────────────────────────
function Cell({ m }: { m: MetricCardDef }) {
    return (
        <div
            className="flex items-baseline justify-between gap-2 px-2.5 py-1.5 border-b border-gray-100 dark:border-gray-800/60 min-w-0"
            title={m.hint}
        >
            <span className="text-[10px] uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400 truncate">
                {m.label}
            </span>
            <span className="flex items-baseline justify-end gap-1 shrink-0">
                <span className={`text-[13px] font-semibold tabular-nums text-right ${VALUE_COLORS[m.statusType]}`}>
                    {m.value}
                </span>
                {/* Fixed-width status column — keeps every value's right edge
                    aligned across cells regardless of label length */}
                <span className="hidden sm:inline-block w-11 whitespace-nowrap overflow-hidden text-left text-[9px] font-medium text-gray-400 dark:text-gray-500 uppercase">
                    {m.statusLabel !== '-' ? m.statusLabel : ''}
                </span>
            </span>
        </div>
    );
}

// ── Section: header row + wrapped grid of cells ──────────────────────────────
function Group({ title, metrics, children }: { title: string; metrics: MetricCardDef[]; children?: React.ReactNode }) {
    if (!metrics.length) return null;
    return (
        <div>
            <div className="flex items-center justify-between px-2.5 pt-3 pb-1">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    {title}
                </h3>
                {children}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {metrics.map((m) => <Cell key={m.label} m={m} />)}
            </div>
        </div>
    );
}

// ── Main export ──────────────────────────────────────────────────────────────
export function KeyMetricsTable({ data, ewScore }: Props) {
    const { scores, valuation, profitability, growth, solvency, quality, balanceSheet, lossYears } = useMemo(
        () => buildMetrics(data, ewScore),
        [data, ewScore]
    );

    const hasScores =
        data.healthScore != null || data.profitabilityScore != null || data.valuationScore != null ||
        (ewScore?.totalScore != null && ewScore?.maxPossible != null);

    return (
        <section
            aria-label="Key financial metrics"
            className="bg-white dark:bg-[#15171e] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-gray-100 dark:border-gray-800/80 p-4 sm:p-5"
        >
            <div className="flex items-center gap-2.5 mb-1">
                <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex-shrink-0">
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Key Metrics</h2>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Valuation, profitability, growth, financial health and quality — one consistent as-of period</p>
                </div>
            </div>

            {hasScores && <Group title="Scores" metrics={scores} />}

            <Group title="Valuation" metrics={valuation} />

            <Group title="Profitability & Cash Flow" metrics={profitability} />

            <Group title="Growth & Dilution" metrics={growth} />

            <Group title="Financial Health" metrics={solvency} />

            <Group title="Quality & Risk" metrics={quality}>
                {lossYears > 0 && (
                    <StatusBadge label={`${lossYears} Loss Years (10Y)`} type={lossYears <= 2 ? 'warn' : 'bad'} />
                )}
            </Group>

            <Group title="Balance Sheet" metrics={balanceSheet} />

            {/* Verdict + human-readable callouts */}
            {(data.verdictText || data.humanDebtInfo || data.humanPeInfo) && (
                <div className="mt-3 px-2.5 text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
                    {data.verdictText && <p className="leading-relaxed">{data.verdictText}</p>}
                    {(data.humanDebtInfo || data.humanPeInfo) && (
                        <p>{[data.humanDebtInfo, data.humanPeInfo].filter(Boolean).join(' · ')}</p>
                    )}
                </div>
            )}

            {/* Shared as-of: statements period + ratio snapshot freshness */}
            {(data.statements?.[0]?.endDate || data.finnhub?.fetchedAt) && (
                <p className="mt-2 px-2.5 text-[10px] text-gray-400 dark:text-gray-500">
                    {[
                        data.statements?.[0]?.endDate && `Financials as of ${new Date(data.statements[0].endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
                        data.finnhub?.fetchedAt && `Ratio snapshot ${new Date(data.finnhub.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
                    ].filter(Boolean).join(' · ')}
                </p>
            )}
        </section>
    );
}
