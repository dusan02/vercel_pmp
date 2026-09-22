'use client';

import React, { useMemo } from 'react';
import { AnalysisData, ValuationHistoryStat } from './types';
import { MetricCardDef, StatusType, StatusBadge, VALUE_COLORS } from '../shared/MetricCard';
import { summarizeLossYears } from '@/lib/utils/analysisMath';

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

interface Props {
    data: AnalysisData;
}

// ── Build all metrics — every flow metric shares the same TTM as-of period ───
export function buildMetrics(data: AnalysisData) {
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

    // One consistent source per metric: our own TTM/snapshot math always wins
    // when computable, so every row shares the same as-of period AND matches
    // the pillar radar (which is always own-statement based). Finnhub fills
    // gaps only — it computes on its own basis, so preferring it when our
    // statements age past a threshold produced two different numbers for the
    // same metric on one page (PM: net margin 27.9 vs radar 26.7).
    const pick = <T,>(ours: T | null, fhVal: T | null): T | null =>
        ours ?? fhVal;

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
    const intCov = m?.interestCoverage ?? fh?.interestCoverage ?? null;
    const cr     = pick(bs?.currentRatio ?? null, fh?.currentRatio ?? null);
    const nde    = bs?.netDebtToEbit ?? null;
    const rawDte = pick(bs?.debtToEquity ?? null, fh?.debtEquityRatio ?? null);
    const dte = !hasNegEquity && rawDte != null && Number.isFinite(rawDte) && rawDte >= 0 ? rawDte : null;
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
    const lossHistory = summarizeLossYears(data.statements ?? []);
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

    const pfcf = fh?.priceFreeCashFlow ?? null;
    // Finnhub-only fields — no own-statement source, shown as fetched
    // (percent-basis fields get /100 so they share the decimal convention
    // used by pct(); ratio/$ fields display raw)
    const evSales = fh?.evSales ?? null;
    const divY = fh?.dividendYield ?? null;
    const payout = fh?.payoutRatio ?? null;
    const beta = fh?.beta ?? null;
    const roa = fh?.roa != null ? fh.roa / 100 : null;
    const quick = fh?.quickRatio ?? null;
    const aturn = fh?.assetTurnover ?? null;
    const cps = fh?.cashPerShare ?? null;
    const bvps = fh?.bookValuePerShare ?? null;
    // epsCagr5y reaches the payload only inside the pillars legs (computeMetrics
    // feeds it to the radar but doesn't export it top-level) — read the leg
    // value so this table shows exactly what the radar scored.
    const epsCagr = data.epsCagr5y
        ?? data.pillars?.growth.legs.find(l => l.key === 'epsCagr5y')?.value
        ?? null;
    const fwdGrowth = m?.forwardImpliedGrowth ?? null;

    const def = (
        label: string, value: string,
        statusType: StatusType, statusLabel: string, hint: string,
        primary = false
    ): MetricCardDef => ({ label, value, statusType, statusLabel, hint, primary });

    // Grouped by the five pillars — the first rows of each group are the
    // actual leg inputs that produce that pillar's radar score.
    const valuation: MetricCardDef[] = [
        def('P/E (TTM)', pe != null ? `${pe.toFixed(1)}x` : 'N/A', pe == null ? 'neutral' : pe < 15 ? 'good' : pe <= 25 ? 'neutral' : pe <= 35 ? 'warn' : 'bad', pe == null ? '-' : pe < 15 ? 'Cheap' : pe <= 25 ? 'Fair' : 'Expensive', `Price / TTM EPS (own statements)${histTip(vh?.pe, 'x')}`, true),
        def('P/FCF', pfcf != null ? `${pfcf.toFixed(1)}x` : 'N/A', pfcf == null ? 'neutral' : pfcf < 0 ? 'bad' : pfcf < 15 ? 'good' : pfcf <= 30 ? 'neutral' : pfcf <= 45 ? 'warn' : 'bad', pfcf == null ? '-' : pfcf < 0 ? 'Negative FCF' : pfcf < 15 ? 'Cheap' : pfcf <= 30 ? 'Fair' : 'Expensive', 'Price / Free Cash Flow per share (Finnhub). Inverse of FCF yield — negative when FCF is negative'),
        def('FCF Yield', pct(fcfY), fcfY == null ? 'neutral' : fcfY > 0.05 ? 'good' : fcfY < 0 ? 'bad' : 'warn', fcfY == null ? '-' : fcfY > 0.05 ? 'Value' : fcfY < 0 ? 'Negative' : 'Low', `TTM FCF / Market Cap${histTip(vh?.fcfYield, '%')}`),
        def('P/S (TTM)', psRatio != null ? `${psRatio.toFixed(2)}x` : 'N/A', psRatio == null ? 'neutral' : psRatio < 2 ? 'good' : psRatio <= 5 ? 'neutral' : psRatio <= 10 ? 'warn' : 'bad', psRatio == null ? '-' : psRatio < 2 ? 'Cheap' : psRatio <= 5 ? 'Fair' : 'Expensive', `Price / TTM Revenue (own statements)${histTip(vh?.ps, 'x')}`),
        def(evLabel, evEbitda != null ? `${evEbitda.toFixed(1)}x` : 'N/A', evEbitda == null ? 'neutral' : evEbitda < 12 ? 'good' : evEbitda <= 18 ? 'neutral' : evEbitda <= 25 ? 'warn' : 'bad', evEbitda == null ? '-' : evEbitda < 12 ? 'Cheap' : evEbitda <= 18 ? 'Fair' : 'Expensive', `Enterprise value / ${evEbit != null ? 'TTM EBIT (D&A not in our data)' : 'EBITDA (Finnhub)'} — capital-structure neutral${histTip(vh?.evEbit, 'x')}`),
        def('EV/Sales', evSales != null ? `${evSales.toFixed(1)}x` : 'N/A', evSales == null ? 'neutral' : evSales < 2 ? 'good' : evSales <= 5 ? 'neutral' : evSales <= 10 ? 'warn' : 'bad', evSales == null ? '-' : evSales < 2 ? 'Cheap' : evSales <= 5 ? 'Fair' : evSales <= 10 ? 'Expensive' : 'Very expensive', 'Enterprise Value / TTM Revenue (Finnhub) — capital-structure neutral sales multiple'),
        def('Forward P/E', fpe != null ? `${fpe.toFixed(1)}x` : 'N/A', fpe == null ? 'neutral' : fpe < 15 ? 'good' : fpe <= 25 ? 'neutral' : fpe <= 35 ? 'warn' : 'bad', fpe == null ? '-' : fpe < 15 ? 'Cheap' : fpe <= 25 ? 'Fair' : 'Expensive', 'Price / next-year EPS estimate — shows whether the TTM multiple is rich or just front-loading growth'),
        def('P/B Ratio', pbRatio != null ? mul(pbRatio) : (hasNegEquity ? 'Neg. Equity' : 'N/A'), pbRatio == null ? (hasNegEquity ? 'warn' : 'neutral') : pbRatio < 3 ? 'good' : pbRatio < 8 ? 'warn' : 'bad', pbRatio == null ? (hasNegEquity ? 'Buybacks' : '-') : pbRatio < 3 ? 'Fair' : pbRatio < 8 ? 'Expensive' : 'Very expensive', 'Price to Book Value. Neg. equity = heavy buybacks'),
        def('PEG Ratio', peg != null ? `${peg.toFixed(2)}` : 'N/A', peg == null ? 'neutral' : peg < 1 ? 'good' : peg <= 2 ? 'neutral' : peg <= 3 ? 'warn' : 'bad', peg == null ? '-' : peg < 1 ? 'Cheap' : peg <= 2 ? 'Fair' : 'Expensive', 'Finnhub PEG — their P/E basis ÷ expected EPS growth. Suppressed when their P/E diverges >2× from our TTM P/E (different basis)'),
        def('Dividend Yield', divY != null ? `${divY.toFixed(2)}%` : 'N/A', divY == null ? 'neutral' : divY <= 0 ? 'neutral' : divY < 6 ? 'good' : 'warn', divY == null ? '-' : divY <= 0 ? 'None' : divY < 6 ? 'Pays' : 'High', 'TTM dividend yield (Finnhub) — annual dividends / price. None = no dividend; very high yield can signal distress'),
        def('Payout Ratio', payout != null ? `${payout.toFixed(1)}%` : 'N/A', payout == null ? 'neutral' : payout < 0 || payout > 90 ? 'bad' : payout <= 60 ? 'good' : 'warn', payout == null ? '-' : payout < 0 || payout > 90 ? 'Unsustainable' : payout <= 60 ? 'Safe' : 'High', 'Dividends / Net Income (Finnhub) — share of earnings paid out; >90% or negative = unsustainable'),
    ];

    // Market context — Beta moved out of Valuation (it describes price
    // behaviour vs the market, not cheapness). Market Cap sits beside it.
    const market: MetricCardDef[] = [
        def('Market Cap', fmtB(mcap), 'neutral', '-', 'Current Market Capitalization'),
        def('Beta', beta != null ? beta.toFixed(2) : 'N/A', beta == null ? 'neutral' : beta <= 1.2 ? 'neutral' : beta <= 1.8 ? 'warn' : 'bad', beta == null ? '-' : beta < 0.8 ? 'Defensive' : beta <= 1.2 ? 'Market' : beta <= 1.8 ? 'Volatile' : 'High volatility', 'Price sensitivity vs the market (Finnhub) — 1.0 moves with market, >1.2 amplifies swings'),
    ];

    // Per-share snapshot — absolute amounts rather than ratios
    const niPs = m?.currentEps ?? fh?.netIncomePerShare ?? null;
    const perShare: MetricCardDef[] = [
        def('EPS (TTM)', niPs != null && Number.isFinite(niPs) ? `$${niPs.toFixed(2)}` : 'N/A', 'neutral', '-', m?.currentEps != null ? 'Own TTM net income / shares — same earnings basis as P/E' : 'TTM net income per share (Finnhub fallback)'),
        def('Cash / Share', cps != null ? `$${cps.toFixed(2)}` : 'N/A', 'neutral', '-', 'Cash & short-term investments per share (Finnhub)'),
        def('Book Value / Share', bvps != null ? `$${bvps.toFixed(2)}` : 'N/A', bvps == null ? 'neutral' : bvps < 0 ? 'warn' : 'neutral', bvps == null ? '-' : bvps < 0 ? 'Negative' : '-', "Shareholders' equity per share (Finnhub). Negative = accumulated losses / heavy buybacks"),
    ];

    const growth: MetricCardDef[] = [
        def('Revenue CAGR', rCagr != null ? `${rCagr.toFixed(1)}%` : 'N/A', rCagr == null ? 'neutral' : rCagr > 15 ? 'good' : rCagr > 5 ? 'warn' : 'bad', rCagr == null ? '-' : rCagr > 15 ? 'High' : rCagr > 5 ? 'Ok' : 'Low', 'Compound annual revenue growth (up to 5Y depending on data availability)', true),
        def('Net Income CAGR', niCagr != null ? `${niCagr.toFixed(1)}%` : 'N/A', niCagr == null ? 'neutral' : niCagr > 15 ? 'good' : niCagr > 5 ? 'warn' : 'bad', niCagr == null ? '-' : niCagr > 15 ? 'High' : niCagr > 5 ? 'Ok' : 'Low', 'Compound annual net income growth (up to 5Y depending on data availability)'),
        def('EPS CAGR (5Y)', epsCagr != null ? `${epsCagr.toFixed(1)}%` : 'N/A', epsCagr == null ? 'neutral' : epsCagr > 15 ? 'good' : epsCagr > 5 ? 'warn' : 'bad', epsCagr == null ? '-' : epsCagr > 15 ? 'High' : epsCagr > 5 ? 'Ok' : 'Low', 'Compound annual EPS growth over up to 5Y of per-share earnings (own statements). Null when either endpoint EPS ≤ 0'),
        def('Implied EPS Growth', fwdGrowth != null ? `${fwdGrowth.toFixed(1)}%` : 'N/A', fwdGrowth == null ? 'neutral' : fwdGrowth > 30 ? 'good' : fwdGrowth > 15 ? 'warn' : fwdGrowth > 0 ? 'neutral' : 'bad', fwdGrowth == null ? '-' : fwdGrowth > 30 ? 'High' : fwdGrowth > 15 ? 'Med' : fwdGrowth > 0 ? 'Low' : 'Decl.', 'Implied 1Y EPS growth from forward P/E vs our TTM EPS. Sparse — only where forward estimates exist'),
        def('Dilution (5Y)', dil != null ? `${dil > 0 ? '+' : ''}${dil.toFixed(1)}%` : 'N/A', dil == null ? 'neutral' : dil < -2 ? 'good' : dil <= 2 ? 'neutral' : dil <= 10 ? 'warn' : 'bad', dil == null ? '-' : dil < -2 ? 'Buybacks' : dil <= 2 ? 'Flat' : 'Dilutive', 'Share count change over 5Y'),
        def('SBC / Net Income', sbc != null ? `${sbc.toFixed(1)}%` : 'N/A', sbc == null ? 'neutral' : sbc < 10 ? 'good' : sbc < 20 ? 'warn' : 'bad', sbc == null ? '-' : sbc < 10 ? 'Low' : sbc < 20 ? 'Med' : 'High', 'Stock-based comp/Net income. >30% = dilution risk'),
        def('SBC / Revenue', pct(sbcRev), sbcRev == null ? 'neutral' : sbcRev < 0.03 ? 'good' : sbcRev < 0.08 ? 'warn' : 'bad', sbcRev == null ? '-' : sbcRev < 0.03 ? 'Low' : sbcRev < 0.08 ? 'Med' : 'High', 'TTM stock-based comp / TTM Revenue'),
    ];

    const profitability: MetricCardDef[] = [
        def('ROIC', roic != null ? pct(roic) : 'N/A', roic == null ? 'neutral' : roic > 0.15 ? 'good' : roic > 0.08 ? 'warn' : 'bad', roic == null ? '-' : roic > 0.15 ? 'Moat' : roic > 0.08 ? 'Average' : 'Low', 'NOPAT (EBIT less ~21% tax) / invested capital (equity + debt − cash). Flagship quality metric — durable >15% signals a moat', true),
        def('ROE', roe != null ? pct(roe) : (hasNegEquity ? 'Neg. Equity' : 'N/A'), roe == null ? (hasNegEquity ? 'warn' : 'neutral') : roe > 0.20 ? 'good' : roe > 0.10 ? 'warn' : 'bad', roe == null ? (hasNegEquity ? 'Buybacks' : '-') : roe > 0.2 ? 'Strong' : roe > 0.1 ? 'Average' : 'Weak', 'Return on Equity. Neg. equity = heavy buybacks'),
        def('ROA', roa != null ? pct(roa) : 'N/A', roa == null ? 'neutral' : roa > 0.10 ? 'good' : roa > 0.05 ? 'warn' : 'bad', roa == null ? '-' : roa > 0.1 ? 'Strong' : roa > 0.05 ? 'Average' : 'Weak', 'Return on Assets (Finnhub) — Net Income / Total Assets; how efficiently assets produce profit'),
        def('Net Margin', pct(netMar), netMar == null ? 'neutral' : netMar > 0.10 ? 'good' : netMar > 0.05 ? 'warn' : 'bad', netMar == null ? '-' : netMar > 0.1 ? 'High' : netMar > 0.05 ? 'Average' : 'Low', 'Net Income / Revenue'),
        def('Operating Margin', pct(opMargin), opMargin == null ? 'neutral' : opMargin > 0.25 ? 'good' : opMargin > 0.10 ? 'warn' : 'bad', opMargin == null ? '-' : opMargin > 0.25 ? 'High' : opMargin > 0.10 ? 'Average' : 'Low', 'TTM EBIT / TTM Revenue'),
        def('Gross Margin', pct(grossMar), grossMar == null ? 'neutral' : grossMar > 0.50 ? 'good' : grossMar > 0.30 ? 'warn' : 'bad', grossMar == null ? '-' : grossMar > 0.5 ? 'Premium' : grossMar > 0.3 ? 'Average' : 'Low', 'Gross Profit / Revenue'),
        def('FCF Margin', pct(fcfMar), fcfMar == null ? 'neutral' : fcfMar > 0.15 ? 'good' : fcfMar > 0.08 ? 'warn' : 'bad', fcfMar == null ? '-' : fcfMar > 0.15 ? 'High' : fcfMar > 0.08 ? 'Average' : 'Low', 'FCF / Revenue'),
        def('True FCF Margin', pct(trueFcfM), trueFcfM == null ? 'neutral' : trueFcfM > 0.12 ? 'good' : trueFcfM > 0.05 ? 'warn' : 'bad', trueFcfM == null ? '-' : trueFcfM > 0.12 ? 'High' : trueFcfM > 0.05 ? 'Average' : 'Low', 'TTM (OCF − CapEx − SBC) / TTM Revenue — SBC treated as a real cost'),
    ];

    const solvency: MetricCardDef[] = [
        def('Altman Z-Score', altZ != null ? altZ.toFixed(2) : 'N/A', altZ == null ? 'neutral' : altZ > 3 ? 'good' : altZ < 1.8 ? 'bad' : 'warn', altZ == null ? '-' : altZ > 3 ? 'Safe' : altZ < 1.8 ? 'Distress' : 'Gray zone', 'Bankruptcy risk. >3 Safe, <1.8 Distress', true),
        def('Current Ratio', mul(cr), cr == null ? 'neutral' : cr > 2 ? 'good' : cr > 1 ? 'warn' : 'bad', cr == null ? '-' : cr > 2 ? 'High' : cr > 1 ? 'Ok' : 'Low', 'Current Assets/Liabilities'),
        def('Quick Ratio', quick != null ? mul(quick) : 'N/A', quick == null ? 'neutral' : quick > 1 ? 'good' : quick > 0.5 ? 'warn' : 'bad', quick == null ? '-' : quick > 1 ? 'High' : quick > 0.5 ? 'Ok' : 'Low', '(Current Assets − Inventory) / Current Liabilities (Finnhub) — stricter liquidity test, excludes inventory'),
        def('Interest Coverage', intCov != null ? `${intCov.toFixed(1)}x` : 'N/A', intCov == null ? 'neutral' : intCov > 10 ? 'good' : intCov > 3 ? 'warn' : 'bad', intCov == null ? '-' : intCov > 10 ? 'Strong' : intCov > 3 ? 'Ok' : 'Risky', 'EBIT/Interest. >10 Strong'),
        def('Debt Repayment', yr(debtRp), debtRp == null ? 'neutral' : debtRp <= 3 ? 'good' : debtRp > 10 ? 'bad' : 'warn', debtRp == null ? '-' : debtRp <= 3 ? 'Fast' : debtRp > 10 ? 'Slow' : 'Average', 'Years to repay net debt via FCF'),
        def('Net Debt/EBIT', nde != null ? (nde < 0 ? 'Net Cash' : `${nde.toFixed(1)}x`) : 'N/A', nde == null ? 'neutral' : nde < 4 ? (nde < 2 ? 'good' : 'warn') : 'bad', nde == null ? '-' : nde < 2 ? 'Low' : nde < 4 ? 'Med' : 'High', 'Leverage. <2x Low, >4x High'),
        def('Debt/Equity', dte != null ? `${dte.toFixed(2)}x` : 'N/A', dte == null ? 'neutral' : dte < 1 ? 'good' : dte < 2 ? 'warn' : 'bad', dte == null ? '-' : dte < 1 ? 'Low' : dte < 2 ? 'Med' : 'High', 'Debt / Equity: <1 Conservative, >2 Risky. Not meaningful with non-positive equity; shown as unavailable rather than low debt.'),
        def('Cash / Debt', cashDebt === Infinity ? 'No Debt' : cashDebt != null ? `${cashDebt.toFixed(2)}x` : 'N/A', cashDebt == null ? 'neutral' : cashDebt === Infinity || cashDebt >= 1 ? 'good' : cashDebt >= 0.3 ? 'warn' : 'bad', cashDebt == null ? '-' : cashDebt === Infinity ? 'Clean' : cashDebt >= 1 ? 'Covered' : cashDebt >= 0.3 ? 'Partial' : 'Thin', 'Cash covers how much of total debt. >1 = could repay all debt from cash'),
    ];

    const quality: MetricCardDef[] = [
        def('Piotroski F-Score', pio != null ? `${pio}/9` : 'N/A', pio == null ? 'neutral' : pio >= 7 ? 'good' : pio >= 4 ? 'warn' : 'bad', pio == null ? '-' : pio >= 7 ? 'Strong' : pio >= 4 ? 'Average' : 'Weak', 'Financial strength 0–9. >7 Strong', true),
        def('Beneish M-Score', ben != null ? ben.toFixed(2) : 'N/A', ben == null ? 'neutral' : ben < -2.22 ? 'good' : ben < -1.78 ? 'warn' : 'bad', ben == null ? '-' : ben < -2.22 ? 'Safe' : ben < -1.78 ? 'Gray zone' : 'Risky', 'Earnings manipulation risk. < -2.22 Safe'),
        def('FCF Conversion', pct(fcfCon), fcfCon == null ? 'neutral' : fcfCon > 0.80 ? 'good' : fcfCon > 0.50 ? 'warn' : 'bad', fcfCon == null ? '-' : fcfCon > 0.8 ? 'Strong' : fcfCon > 0.5 ? 'Average' : 'Poor', 'FCF / Net Income'),
        def('Margin Stability', mv != null ? `${(mv * 100).toFixed(1)}%` : 'N/A', mv == null ? 'neutral' : mv < 0.08 ? 'good' : mv < 0.15 ? 'warn' : 'bad', mv == null ? '-' : mv < 0.08 ? 'Stable' : mv < 0.15 ? 'Average' : 'Volatile', 'EBIT margin std deviation. Lower = stable'),
        def('Capex / Revenue', pct(capexRev), capexRev == null ? 'neutral' : capexRev < 0.05 ? 'good' : capexRev < 0.15 ? 'warn' : 'bad', capexRev == null ? '-' : capexRev < 0.05 ? 'Asset-light' : capexRev < 0.15 ? 'Average' : 'Heavy', 'TTM CapEx / TTM Revenue — high % = capital-hungry business'),
        def('Asset Turnover', aturn != null ? `${aturn.toFixed(2)}x` : 'N/A', aturn == null ? 'neutral' : aturn > 1 ? 'good' : aturn > 0.5 ? 'warn' : 'bad', aturn == null ? '-' : aturn > 1 ? 'High' : aturn > 0.5 ? 'Average' : 'Low', 'Revenue / Total Assets (Finnhub) — how efficiently the asset base generates sales'),
    ];

    const balanceSheet: MetricCardDef[] = [
        def('Total Debt', fmtB(bs?.totalDebt), 'neutral', '-', 'Total debt obligations (short + long term)'),
        def('Cash & Equiv.', fmtB(bs?.cash), 'neutral', '-', 'Cash and short-term investments'),
        def('Net Debt', fmtB(bs?.netDebt), bs?.netDebt != null && bs.netDebt < 0 ? 'good' : 'neutral', bs?.netDebt != null && bs.netDebt < 0 ? 'Net Cash' : '-', 'Total Debt minus Cash. Negative = Net Cash position', true),
        def('Total Equity', fmtB(bs?.totalEquity), 'neutral', '-', "Shareholders' equity (book value)"),
        def('Asset / Liability', bs?.assetToLiability != null ? `${bs.assetToLiability.toFixed(2)}x` : 'N/A', bs?.assetToLiability == null ? 'neutral' : bs.assetToLiability >= 2 ? 'good' : bs.assetToLiability >= 1 ? 'warn' : 'bad', bs?.assetToLiability == null ? '-' : bs.assetToLiability >= 2 ? 'Solid' : bs.assetToLiability >= 1 ? 'Adequate' : 'Risky', 'Total Assets / Total Liabilities'),
    ];

    return { valuation, profitability, growth, solvency, quality, balanceSheet, market, perShare, lossYears: lossHistory.lossYears, lossHistory };
}

// ── Letter grades — report-card style. Per-metric grade derives from the
// existing 4-level status judgment (good/neutral/warn/bad → A/B/C/D); finer
// +/- granularity would need per-metric grade functions. Card headers use
// the pillar score mapped to the full A+..E scale. ─────────────────────────
const GRADE_STYLES: Record<'A' | 'B' | 'C' | 'D', string> = {
    A: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/60',
    B: 'bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:border-lime-800/60',
    C: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/60',
    D: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/60',
};

function statusGrade(t: StatusType): 'A' | 'B' | 'C' | 'D' {
    return t === 'good' ? 'A' : t === 'neutral' ? 'B' : t === 'warn' ? 'C' : 'D';
}

function scoreToGrade(score: number): string {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B+';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C';
    if (score >= 40) return 'D+';
    if (score >= 30) return 'D';
    return 'E';
}

function scoreGradeStyle(score: number): string {
    if (score >= 70) return GRADE_STYLES.A;
    if (score >= 50) return GRADE_STYLES.B;
    if (score >= 30) return GRADE_STYLES.C;
    return GRADE_STYLES.D;
}

function GradeChip({ grade, cls, title }: { grade: string; cls: string; title?: string }) {
    return (
        <span
            title={title}
            className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold leading-none shrink-0 ${cls}`}
        >
            {grade}
        </span>
    );
}

// ── Dense metric cell — Finviz-style label:value pair. The dotted leader
// guides the eye from label to value on wide grids; the ⓘ icon advertises
// that the row has an explanation (native title tooltip). `primary` marks
// each section's flagship metric with a tint + heavier type so the eye lands
// on P/E, ROIC, Revenue CAGR, Altman Z, Piotroski F and Net Debt first. ────
function Cell({ m }: { m: MetricCardDef }) {
    const missing = m.value === 'N/A';
    const cellCls = `px-3 py-1.5 min-w-0 ${m.primary ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''}`;
    const row = (
        <>
            <span className={`flex items-center gap-1 min-w-0 text-[10px] uppercase tracking-wide ${m.primary ? 'font-semibold text-gray-600 dark:text-gray-300' : 'font-medium text-gray-500 dark:text-gray-400'}`}>
                <span className="truncate">{m.label}</span>
                {m.hint && (
                    <svg className="w-3 h-3 shrink-0 text-gray-300 dark:text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                )}
            </span>
            <span aria-hidden="true" className="hidden sm:block flex-1 min-w-2 mx-1 border-b border-dotted border-gray-300 dark:border-gray-600 -translate-y-[3px]" />
            <span className="flex items-baseline justify-end gap-1.5 shrink-0">
                <span className={`text-[13px] ${m.primary ? 'font-bold' : 'font-semibold'} tabular-nums text-right ${missing ? 'text-gray-400 dark:text-gray-500' : VALUE_COLORS[m.statusType]}`}>
                    {missing ? '—' : m.value}
                </span>
                {/* Fixed-width grade chip = uniform right edge; word status
                    stays reachable via the chip's title tooltip. */}
                {m.statusLabel !== '-' ? (
                    <GradeChip grade={statusGrade(m.statusType)} cls={GRADE_STYLES[statusGrade(m.statusType)]} title={m.statusLabel} />
                ) : (
                    <span className="w-5 h-5 shrink-0" aria-hidden="true" />
                )}
            </span>
        </>
    );
    // Native title tooltips are unreachable on touch — <details> gives a
    // disclosure toggle for free (tap, keyboard, SR) without JS state.
    if (!m.hint) {
        return <div className={`${cellCls} flex items-baseline justify-between gap-2`}>{row}</div>;
    }
    return (
        <details className={`${cellCls} group`} title={m.hint}>
            <summary className="flex items-baseline justify-between gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                {row}
            </summary>
            <p className="mt-1.5 text-[10px] leading-snug text-gray-500 dark:text-gray-400 normal-case tracking-normal">
                {m.statusLabel !== '-' && (
                    <span className="block mb-0.5 font-semibold text-gray-600 dark:text-gray-300">
                        Grade {statusGrade(m.statusType)}: {m.statusLabel}
                    </span>
                )}
                {m.hint}
            </p>
        </details>
    );
}

// ── Pillar card: name + pillar score (same value as the radar) + a vertical
// metric list. Every value shares the card's right edge; missing metrics keep
// their row and render as a muted '—'. ──────────────────────────────────────
function scoreColor(score: number): string {
    if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
}

// ── Valuation tile — used only inside the large Valuation card. Number is
// dominant, status is a muted caption (no badge chrome). ────────────────────
function Tile({ m }: { m: MetricCardDef }) {
    const missing = m.value === 'N/A';
    const inner = (
        <>
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400 min-w-0">
                <span className="truncate">{m.label}</span>
                {m.hint && (
                    <svg className="w-3 h-3 shrink-0 text-gray-300 dark:text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                )}
            </span>
            <span className="mt-1 flex items-baseline gap-1.5">
                <span className={`text-[15px] font-bold tabular-nums leading-tight ${missing ? 'text-gray-400 dark:text-gray-500' : VALUE_COLORS[m.statusType]}`}>
                    {missing ? '—' : m.value}
                </span>
                {m.statusLabel !== '-' && (
                    <GradeChip grade={statusGrade(m.statusType)} cls={GRADE_STYLES[statusGrade(m.statusType)]} title={m.statusLabel} />
                )}
            </span>
        </>
    );
    const cls = 'px-3 py-2 flex flex-col items-start min-w-0 bg-white dark:bg-[#15171e]';
    if (!m.hint) return <div className={cls}>{inner}</div>;
    return (
        <details className={`${cls} group`} title={m.hint}>
            <summary className="flex flex-col items-start cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden w-full">
                {inner}
            </summary>
            <p className="mt-1 text-[10px] leading-snug text-gray-500 dark:text-gray-400 normal-case tracking-normal">
                {m.statusLabel !== '-' && (
                    <span className="block mb-0.5 font-semibold text-gray-600 dark:text-gray-300">
                        Grade {statusGrade(m.statusType)}: {m.statusLabel}
                    </span>
                )}
                {m.hint}
            </p>
        </details>
    );
}

// ── P/E vs own history — thin percentile bar inside the Valuation card ─────
function HistBar({ stat }: { stat: ValuationHistoryStat | undefined }) {
    if (!stat || stat.percentile == null || stat.min == null || stat.max == null) return null;
    const p = stat.percentile;
    const label = p >= 67 ? 'Above average' : p <= 33 ? 'Below average' : 'In range';
    const barColor = p >= 67 ? 'bg-rose-400 dark:bg-rose-500' : p <= 33 ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-amber-400 dark:bg-amber-500';
    const yrs = stat.years != null && stat.years >= 1 ? `${Math.round(stat.years)}Y` : 'hist.';
    const pctText = p >= 99 ? 'highest in history' : p <= 1 ? 'lowest in history' : `${ordinalSuffix(Math.round(p))} pct`;
    return (
        <div className="mt-2 px-3 pb-2">
            <div className="flex items-baseline justify-between gap-2 text-[9px] uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400">
                <span>P/E vs own {yrs} history</span>
                <span className="text-gray-600 dark:text-gray-300">{label} · {pctText}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
            </div>
        </div>
    );
}

function PillarCard({ title, score, metrics, children }: { title: string; score?: number | null; metrics: MetricCardDef[]; children?: React.ReactNode }) {
    if (!metrics.length) return null;
    return (
        <div className="rounded-xl border border-gray-200/80 dark:border-gray-800/80 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50/90 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800/60">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300">
                    {title}
                </h3>
                <span className="flex items-center gap-1.5">
                    {children}
                    {score != null && (
                        <span className="flex items-center gap-1" aria-label={`${title} score ${score} out of 100, grade ${scoreToGrade(score)}`}>
                            <span className={`text-[11px] font-semibold tabular-nums ${scoreColor(score)}`}>{score}</span>
                            <GradeChip grade={scoreToGrade(score)} cls={scoreGradeStyle(score)} />
                        </span>
                    )}
                </span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {metrics.map((m) => <Cell key={m.label} m={m} />)}
            </div>
        </div>
    );
}

// ── Main export ──────────────────────────────────────────────────────────────
export function KeyMetricsTable({ data }: Props) {
    const { valuation, profitability, growth, solvency, quality, balanceSheet, market, perShare, lossYears, lossHistory } = useMemo(
        () => buildMetrics(data),
        [data]
    );
    const peStat = data.valuationHistoryStats?.pe;

    return (
        <section
            aria-label="Key financial metrics"
            className="bg-white dark:bg-[#15171e] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-gray-100 dark:border-gray-800/80 p-4 sm:p-5"
        >
            <div className="flex items-center gap-2.5 mb-3">
                <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex-shrink-0">
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Key Metrics</h2>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Financial snapshot — pillar inputs plus per-share and market context</p>
                </div>
            </div>

            {/* Financial-snapshot dashboard — masonry-style proportions:
                Valuation is the biggest block (2/3 width, metric tiles + P/E
                history bar) sharing row one with Profitability. The other
                pillar cards form the second tier and the per-share /
                balance-sheet / market context cards the small third tier. */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                {/* ── Large: Valuation (2/3 width) ─────────────────────── */}
                <div className="sm:col-span-2 rounded-xl border border-gray-200/80 dark:border-gray-800/80 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50/90 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800/60">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300">
                            Valuation
                        </h3>
                        {data.pillars?.valuation.score != null && (
                            <span className="flex items-center gap-1" aria-label={`Valuation score ${data.pillars.valuation.score} out of 100, grade ${scoreToGrade(data.pillars.valuation.score)}`}>
                                <span className={`text-[11px] font-semibold tabular-nums ${scoreColor(data.pillars.valuation.score)}`}>{data.pillars.valuation.score}</span>
                                <GradeChip grade={scoreToGrade(data.pillars.valuation.score)} cls={scoreGradeStyle(data.pillars.valuation.score)} />
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100 dark:bg-gray-800/60">
                        {valuation.map((m) => <Tile key={m.label} m={m} />)}
                    </div>
                    <HistBar stat={peStat} />
                </div>

                {/* ── Medium: remaining pillar cards ───────────────────── */}
                <PillarCard title="Profitability" score={data.pillars?.profitability.score ?? null} metrics={profitability} />
                <PillarCard title="Financial Health" score={data.pillars?.health.score ?? null} metrics={solvency} />
                <PillarCard title="Growth" score={data.pillars?.growth.score ?? null} metrics={growth} />
                <PillarCard title="Quality" score={data.pillars?.quality.score ?? null} metrics={quality}>
                    {lossYears > 0 && (
                        <span title={`Completed fiscal years ${lossHistory.firstYear}–${lossHistory.lastYear}`}>
                            <StatusBadge label={`${lossYears}/${lossHistory.reportedYears} Loss Years`} type={lossYears <= 2 ? 'warn' : 'bad'} />
                        </span>
                    )}
                </PillarCard>

                {/* ── Small: context cards — collapsed by default so the page
                    doesn't read as a wall of numbers; power users expand. ─── */}
                {(perShare.length > 0 || balanceSheet.length > 0 || market.length > 0) && (
                    <details className="sm:col-span-2 lg:col-span-3 group/more">
                        <summary className="flex items-center justify-center gap-1.5 py-1.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                            <svg className="w-3 h-3 transition-transform group-open/more:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                            </svg>
                            <span className="group-open/more:hidden">More metrics — Per Share, Balance Sheet, Market</span>
                            <span className="hidden group-open/more:inline">Hide additional metrics</span>
                        </summary>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                            <PillarCard title="Per Share" metrics={perShare} />
                            <PillarCard title="Balance Sheet" metrics={balanceSheet} />
                            <PillarCard title="Market" metrics={market} />
                        </div>
                    </details>
                )}
            </div>

            {/* Verdict + human-readable callouts — tinted "takeaway" block so
                the bottom line reads as the table's conclusion, not a stray note */}
            {(data.verdictText || data.humanDebtInfo || data.humanPeInfo) && (
                <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/60 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Takeaway</p>
                    <div className="text-[11px] text-gray-600 dark:text-gray-300 space-y-1">
                        {data.verdictText && <p className="leading-relaxed">{data.verdictText}</p>}
                        {(data.humanDebtInfo || data.humanPeInfo) && (
                            <p>{[data.humanDebtInfo, data.humanPeInfo].filter(Boolean).join(' · ')}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Grade legend — the two scales are easy to conflate otherwise:
                rows carry per-metric A–D, cards carry the pillar score's
                A+–E. Stating it once here keeps every header self-explanatory. */}
            <p className="mt-3 px-2.5 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
                <span className="font-semibold text-gray-500 dark:text-gray-400">How grades work:</span>
                {' '}each metric is graded A–D against fixed thresholds (tap a row for the meaning). Card grades map the pillar score to A+–E — a card grade is that pillar&apos;s own score, not an average of the rows shown.
            </p>

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
