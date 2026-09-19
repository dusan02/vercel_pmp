import React, { useMemo } from 'react';
import { AnalysisData } from './types';
import { CompactMetricRow, MetricCardDef, StatusType, StatusBadge } from '../shared/MetricCard';

interface Props {
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
    flowPeriods?: import('./sections/FinancialFlowsSection').FlowPeriods | null | undefined;
}

// ── Build all metrics ────────────────────────────────────────────────────────
function buildMetrics(data: AnalysisData, sec: AnalysisData | null, cw: string, flowPeriods?: Props['flowPeriods']) {
    const m = data.metrics;
    const sm = sec?.metrics;
    const bs = data.balanceSheet;
    const sbs = sec?.balanceSheet;
    const mcap = data.ticker?.lastMarketCap ? data.ticker.lastMarketCap * 1e9 : null;
    const smcap = sec?.ticker?.lastMarketCap ? sec.ticker.lastMarketCap * 1e9 : null;

    const pct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : 'N/A';
    const yr  = (v: number | null | undefined) => v != null ? (v === 0 ? 'Net Cash' : `${v.toFixed(1)}y`) : 'N/A';
    const mul = (v: number | null | undefined, d = 2) => v != null ? `${v.toFixed(d)}x` : 'N/A';
    const s   = (v: string | undefined) => cw ? v : undefined;

    // Helper formatting
    function fmtB(val: number | null | undefined): string {
        if (val == null) return 'N/A';
        const absVal = Math.abs(val);
        if (absVal >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
        if (absVal >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
        if (absVal >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
        return `$${val.toFixed(0)}`;
    }

    const ttm = data.ttm;
    const sttm = sec?.ttm;

    const fh = data.finnhub;
    const sfh = sec?.finnhub;

    const hasNegEquity  = bs?.totalEquity != null && bs.totalEquity <= 0;
    const sHasNegEquity = sbs?.totalEquity != null && sbs.totalEquity <= 0;

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
    const sFresh = stmtAge(sec?.statements) < STMT_FRESH_MS;
    const pick = <T,>(ours: T | null, fhVal: T | null, isFresh: boolean): T | null =>
        isFresh ? (ours ?? fhVal) : (fhVal ?? ours);

    // ROE: own TTM when statements are fresh, else Finnhub (returns %).
    // If equity is negative, ROE is misleading — show 'Neg. Equity' instead
    const ourRoe  = (ttm?.netIncome != null && bs?.totalEquity != null && bs.totalEquity > 0) ? ttm.netIncome / bs.totalEquity : null;
    const ourSroe = (sttm?.netIncome != null && sbs?.totalEquity != null && sbs.totalEquity > 0) ? sttm.netIncome / sbs.totalEquity : null;
    const roe  = hasNegEquity  ? null : pick(ourRoe,  fh?.roe  != null ? fh.roe  / 100 : null, fresh);
    const sroe = sHasNegEquity ? null : pick(ourSroe, sfh?.roe != null ? sfh.roe / 100 : null, sFresh);
    // Net Margin / Gross Margin: same source rule
    const ourNm = (ttm?.netIncome != null && ttm?.revenue != null && ttm.revenue > 0) ? ttm.netIncome / ttm.revenue : null;
    const ourSnm= (sttm?.netIncome != null && sttm?.revenue != null && sttm.revenue > 0) ? sttm.netIncome / sttm.revenue : null;
    const netMar  = pick(ourNm,  fh?.netMargin  != null ? fh.netMargin  / 100 : null, fresh);
    const sNetMar = pick(ourSnm, sfh?.netMargin != null ? sfh.netMargin / 100 : null, sFresh);
    const ourGm = (ttm?.grossProfit != null && ttm?.revenue != null && ttm.revenue > 0) ? ttm.grossProfit / ttm.revenue : null;
    const ourSgm= (sttm?.grossProfit != null && sttm?.revenue != null && sttm.revenue > 0) ? sttm.grossProfit / sttm.revenue : null;
    const grossMar  = pick(ourGm,  fh?.grossMargin  != null ? fh.grossMargin  / 100 : null, fresh);
    const sGrossMar = pick(ourSgm, sfh?.grossMargin != null ? sfh.grossMargin / 100 : null, sFresh);
    // P/B, P/S: same source rule.
    // Negative equity makes P/B meaningless (Finnhub value included) — a
    // distorted P/B could satisfy "< 3" and earn a green "good" badge.
    const ourPb = (mcap != null && bs?.totalEquity != null && bs.totalEquity > 0) ? mcap / bs.totalEquity : null;
    const ourSpb= (smcap != null && sbs?.totalEquity != null && sbs.totalEquity > 0) ? smcap / sbs.totalEquity : null;
    const pbRatio  = hasNegEquity  ? null : pick(ourPb,  fh?.pbRatio  ?? null, fresh);
    const spbRatio = sHasNegEquity ? null : pick(ourSpb, sfh?.pbRatio ?? null, sFresh);
    const ourPs = (mcap != null && ttm?.revenue != null && ttm.revenue > 0) ? mcap / ttm.revenue : null;
    const ourSps= (smcap != null && sttm?.revenue != null && sttm.revenue > 0) ? smcap / sttm.revenue : null;
    const psRatio  = pick(ourPs,  fh?.psRatio ?? null, fresh);
    const spsRatio = pick(ourSps, sfh?.psRatio ?? null, sFresh);

    const altZ   = m?.altmanZ ?? m?.zScore ?? null;
    const saltZ  = sm?.altmanZ ?? sm?.zScore ?? null;
    const debtRp = m?.debtRepaymentYears ?? m?.debtRepaymentTime ?? null;
    const sDebtRp= sm?.debtRepaymentYears ?? sm?.debtRepaymentTime ?? null;
    const intCov = fh?.interestCoverage ?? data.interestCoverage ?? null;
    const sIntCov= sfh?.interestCoverage ?? sec?.interestCoverage ?? null;
    const cr     = pick(bs?.currentRatio ?? null, fh?.currentRatio ?? null, fresh);
    const scr    = pick(sbs?.currentRatio ?? null, sfh?.currentRatio ?? null, sFresh);
    const nde    = bs?.netDebtToEbit ?? null;
    const snde   = sbs?.netDebtToEbit ?? null;
    const dte    = pick(bs?.debtToEquity ?? null, fh?.debtEquityRatio ?? null, fresh);
    const sdte   = pick(sbs?.debtToEquity ?? null, sfh?.debtEquityRatio ?? null, sFresh);
    const cashDebt  = (bs?.cash != null && bs?.totalDebt != null && bs.totalDebt > 0) ? bs.cash / bs.totalDebt : (bs?.totalDebt === 0 ? Infinity : null);
    const sCashDebt = (sbs?.cash != null && sbs?.totalDebt != null && sbs.totalDebt > 0) ? sbs.cash / sbs.totalDebt : (sbs?.totalDebt === 0 ? Infinity : null);
    const fcfMar = m?.fcfMargin ?? null;
    const sfcfMar= sm?.fcfMargin ?? null;
    const fcfCon = m?.fcfConversion ?? null;
    const sfcfCon= sm?.fcfConversion ?? null;
    const rCagr  = data.revenueCagr ?? null;
    const srCagr = sec?.revenueCagr ?? null;
    const niCagr = data.netIncomeCagr ?? null;
    const sniCagr= sec?.netIncomeCagr ?? null;
    const pe     = m?.currentPe ?? null;
    const spe    = sm?.currentPe ?? null;
    const fcfY   = m?.fcfYield ?? null;
    const sfcfY  = sm?.fcfYield ?? null;
    const pio    = data.piotroskiScore ?? null;
    const spio   = sec?.piotroskiScore ?? null;
    const ben    = data.beneishScore ?? null;
    const sben   = sec?.beneishScore ?? null;
    const mv     = data.marginStability ?? null;
    const smv    = sec?.marginStability ?? null;
    const niYrs  = data.negativeNiYears ?? 0;
    const sNiYrs = sec?.negativeNiYears ?? 0;
    const dil    = bs?.dilution5y;
    const sdil   = sbs?.dilution5y;
    const sbc    = bs?.sbcRatio;
    const ssbc   = sbs?.sbcRatio;
    // ROIC — Finnhub's roicTTM is a premium field (never populated on our
    // tier), so compute it: NOPAT (EBIT × (1 − 21% statutory)) / invested
    // capital (equity + debt − cash). Finnhub value stays as fallback.
    const investedCap  = (bs?.totalEquity ?? 0) + (bs?.totalDebt ?? 0) - (bs?.cash ?? 0);
    const sInvestedCap = (sbs?.totalEquity ?? 0) + (sbs?.totalDebt ?? 0) - (sbs?.cash ?? 0);
    const ourRoic  = (ttm?.ebit != null && investedCap > 0) ? (ttm.ebit * 0.79) / investedCap : null;
    const ourSroic = (sttm?.ebit != null && sInvestedCap > 0) ? (sttm.ebit * 0.79) / sInvestedCap : null;
    const roic   = pick(ourRoic, fh?.roic != null ? fh.roic / 100 : null, fresh);
    const sroic  = pick(ourSroic, sfh?.roic != null ? sfh.roic / 100 : null, sFresh);
    // Forward P/E sanity-guarded the same way computeMetrics does (junk <1
    // values appear for illiquid names)
    const fpe    = fh?.forwardPe != null && fh.forwardPe >= 1 ? fh.forwardPe : null;
    const sfpe   = sfh?.forwardPe != null && sfh.forwardPe >= 1 ? sfh.forwardPe : null;
    const evEbitda  = fh?.evEbitda ?? null;
    const sevEbitda = sfh?.evEbitda ?? null;
    const peg   = fh?.pegRatio ?? null;
    const speg  = sfh?.pegRatio ?? null;

    // Flow-period metrics (latest FY or derived quarter) — the same source the
    // sankey charts use, so numbers stay consistent across the page
    const fp = flowPeriods?.annual ?? flowPeriods?.quarterly ?? null;
    const fpPct = (num: number | null | undefined, den: number | null | undefined) =>
        num != null && den != null && den !== 0 ? num / den : null;
    const opMargin  = fpPct(fp?.ebit, fp?.revenue);
    const trueFcfM  = fp?.ocf != null && fp?.capex != null
        ? fpPct(fp.ocf - Math.abs(fp.capex) - (fp.sbc ?? 0), fp.revenue) : null;
    const capexRev  = fp?.capex != null ? fpPct(Math.abs(fp.capex), fp.revenue) : null;
    const sbcRev    = fpPct(fp?.sbc, fp?.revenue);

    const def = (
        label: string, value: string, secondary: string | undefined,
        statusType: StatusType, statusLabel: string, hint: string,
        progress?: number
    ): MetricCardDef => ({ label, value, secondaryValue: secondary, statusType, statusLabel, hint, ...(progress !== undefined ? { progress } : {}) });

    const solvency: MetricCardDef[] = [
        def('Altman Z-Score', altZ != null ? altZ.toFixed(2) : 'N/A', s(altZ != null ? altZ.toFixed(2) : 'N/A'), altZ == null ? 'neutral' : altZ > 3 ? 'good' : altZ < 1.8 ? 'bad' : 'warn', altZ == null ? '-' : altZ > 3 ? 'Safe' : altZ < 1.8 ? 'Distress' : 'Gray zone', 'Bankruptcy risk. >3 Safe, <1.8 Distress', altZ != null ? (altZ / 5) * 100 : undefined),
        def('Debt Repayment', yr(debtRp), s(yr(sDebtRp)), debtRp == null ? 'neutral' : debtRp <= 3 ? 'good' : debtRp > 10 ? 'bad' : 'warn', debtRp == null ? '-' : debtRp <= 3 ? 'Fast' : debtRp > 10 ? 'Slow' : 'Avg', 'Years to repay net debt via FCF', debtRp != null ? (debtRp / 10) * 100 : undefined),
        def('Interest Coverage', intCov != null ? `${intCov.toFixed(1)}x` : 'N/A', s(intCov != null ? `${intCov.toFixed(1)}x` : 'N/A'), intCov == null ? 'neutral' : intCov > 10 ? 'good' : intCov > 3 ? 'warn' : 'bad', intCov == null ? '-' : intCov > 10 ? 'Strong' : intCov > 3 ? 'Ok' : 'Risky', 'EBIT/Interest. >10 Strong', intCov != null ? (intCov / 15) * 100 : undefined),
        def('Current Ratio', mul(cr), s(mul(scr)), cr == null ? 'neutral' : cr > 2 ? 'good' : cr > 1 ? 'warn' : 'bad', cr == null ? '-' : cr > 2 ? 'High' : cr > 1 ? 'Ok' : 'Low', 'Current Assets/Liabilities', cr != null ? (cr / 3) * 100 : undefined),
        def('Net Debt/EBIT', nde != null ? (nde < 0 ? 'Net Cash' : `${nde.toFixed(1)}x`) : 'N/A', s(snde != null ? (snde < 0 ? 'Net Cash' : `${snde.toFixed(1)}x`) : 'N/A'), nde == null ? 'neutral' : nde < 0 ? 'good' : nde < 2 ? 'good' : nde < 4 ? 'warn' : 'bad', nde == null ? '-' : nde < 2 ? 'Low' : nde < 4 ? 'Med' : 'High', 'Leverage. <2x Low, >4x High', nde != null ? Math.max(0, (nde / 5) * 100) : undefined),
        def('Debt/Equity', dte != null ? `${dte.toFixed(2)}x` : 'N/A', s(sdte != null ? `${sdte.toFixed(2)}x` : 'N/A'), dte == null ? 'neutral' : dte < 1 ? 'good' : dte < 2 ? 'warn' : 'bad', dte == null ? '-' : dte < 1 ? 'Low' : dte < 2 ? 'Med' : 'High', '<1 Conservative, >2 Risky', dte != null ? (dte / 3) * 100 : undefined),
        def('Cash / Debt', cashDebt === Infinity ? 'No Debt' : cashDebt != null ? `${cashDebt.toFixed(2)}x` : 'N/A', s(sCashDebt === Infinity ? 'No Debt' : sCashDebt != null ? `${sCashDebt.toFixed(2)}x` : 'N/A'), cashDebt == null ? 'neutral' : cashDebt === Infinity || cashDebt >= 1 ? 'good' : cashDebt >= 0.3 ? 'warn' : 'bad', cashDebt == null ? '-' : cashDebt === Infinity ? 'Clean' : cashDebt >= 1 ? 'Covered' : cashDebt >= 0.3 ? 'Partial' : 'Thin', 'Cash covers how much of total debt. >1 = could repay all debt from cash'),
    ];

    const profitability: MetricCardDef[] = [
        def('ROIC', roic != null ? pct(roic) : 'N/A', s(sroic != null ? pct(sroic) : 'N/A'), roic == null ? 'neutral' : roic > 0.15 ? 'good' : roic > 0.08 ? 'warn' : 'bad', roic == null ? '-' : roic > 0.15 ? 'Moat' : roic > 0.08 ? 'Avg' : 'Low', 'NOPAT (EBIT less ~21% tax) / invested capital (equity + debt − cash). Flagship quality metric — durable >15% signals a moat', roic != null ? (roic / 0.3) * 100 : undefined),
        def('ROE', roe != null ? pct(roe) : (hasNegEquity ? 'Neg. Equity' : 'N/A'), s(sroe != null ? pct(sroe) : (sHasNegEquity ? 'Neg. Equity' : 'N/A')), roe == null ? (hasNegEquity ? 'warn' : 'neutral') : roe > 0.20 ? 'good' : roe > 0.10 ? 'warn' : 'bad', roe == null ? (hasNegEquity ? 'Buybacks' : '-') : roe > 0.2 ? 'Strong' : roe > 0.1 ? 'Avg' : 'Weak', 'Return on Equity. Neg. equity = heavy buybacks', roe != null ? (roe / 0.3) * 100 : undefined),
        def('Net Margin', pct(netMar), s(pct(sNetMar)), netMar == null ? 'neutral' : netMar > 0.10 ? 'good' : netMar > 0.05 ? 'warn' : 'bad', netMar == null ? '-' : netMar > 0.1 ? 'High' : netMar > 0.05 ? 'Avg' : 'Low', 'Net Income / Revenue', netMar != null ? (netMar / 0.3) * 100 : undefined),
        def('Gross Margin', pct(grossMar), s(pct(sGrossMar)), grossMar == null ? 'neutral' : grossMar > 0.50 ? 'good' : grossMar > 0.30 ? 'warn' : 'bad', grossMar == null ? '-' : grossMar > 0.5 ? 'Premium' : grossMar > 0.3 ? 'Avg' : 'Low', 'Gross Profit / Revenue', grossMar != null ? (grossMar / 0.7) * 100 : undefined),
        def('Operating Margin', pct(opMargin), undefined, opMargin == null ? 'neutral' : opMargin > 0.25 ? 'good' : opMargin > 0.10 ? 'warn' : 'bad', opMargin == null ? '-' : opMargin > 0.25 ? 'High' : opMargin > 0.10 ? 'Avg' : 'Low', 'EBIT / Revenue (latest period)', opMargin != null ? (opMargin / 0.4) * 100 : undefined),
        def('FCF Margin', pct(fcfMar), s(pct(sfcfMar)), fcfMar == null ? 'neutral' : fcfMar > 0.15 ? 'good' : fcfMar > 0.08 ? 'warn' : 'bad', fcfMar == null ? '-' : fcfMar > 0.15 ? 'High' : fcfMar > 0.08 ? 'Avg' : 'Low', 'FCF / Revenue', fcfMar != null ? (fcfMar / 0.3) * 100 : undefined),
        def('FCF Conversion', pct(fcfCon), s(pct(sfcfCon)), fcfCon == null ? 'neutral' : fcfCon > 0.80 ? 'good' : fcfCon > 0.50 ? 'warn' : 'bad', fcfCon == null ? '-' : fcfCon > 0.8 ? 'Strong' : fcfCon > 0.5 ? 'Avg' : 'Poor', 'FCF / Net Income', fcfCon != null ? (fcfCon / 1.5) * 100 : undefined),
        def('True FCF Margin', pct(trueFcfM), undefined, trueFcfM == null ? 'neutral' : trueFcfM > 0.12 ? 'good' : trueFcfM > 0.05 ? 'warn' : 'bad', trueFcfM == null ? '-' : trueFcfM > 0.12 ? 'High' : trueFcfM > 0.05 ? 'Avg' : 'Low', '(OCF − CapEx − SBC) / Revenue — SBC treated as a real cost', trueFcfM != null ? (trueFcfM / 0.25) * 100 : undefined),
    ];

    const growth: MetricCardDef[] = [
        def('Revenue CAGR', rCagr != null ? `${rCagr.toFixed(1)}%` : 'N/A', s(srCagr != null ? `${srCagr.toFixed(1)}%` : 'N/A'), rCagr == null ? 'neutral' : rCagr > 15 ? 'good' : rCagr > 5 ? 'warn' : 'bad', rCagr == null ? '-' : rCagr > 15 ? 'High' : rCagr > 5 ? 'Ok' : 'Low', 'Compound annual revenue growth (up to 5Y depending on data availability)'),
        def('Net Income CAGR', niCagr != null ? `${niCagr.toFixed(1)}%` : 'N/A', s(sniCagr != null ? `${sniCagr.toFixed(1)}%` : 'N/A'), niCagr == null ? 'neutral' : niCagr > 15 ? 'good' : niCagr > 5 ? 'warn' : 'bad', niCagr == null ? '-' : niCagr > 15 ? 'High' : niCagr > 5 ? 'Ok' : 'Low', 'Compound annual net income growth (up to 5Y depending on data availability)'),
        def('Dilution (5Y)', dil != null ? `${dil > 0 ? '+' : ''}${dil.toFixed(1)}%` : 'N/A', s(sdil != null ? `${sdil > 0 ? '+' : ''}${sdil.toFixed(1)}%` : 'N/A'), dil == null ? 'neutral' : dil < -2 ? 'good' : dil <= 2 ? 'neutral' : dil <= 10 ? 'warn' : 'bad', dil == null ? '-' : dil < -2 ? 'Buybacks' : dil <= 2 ? 'Flat' : 'Dilutive', 'Share count change over 5Y'),
        def('SBC / Net Income', sbc != null ? `${sbc.toFixed(1)}%` : 'N/A', s(ssbc != null ? `${ssbc.toFixed(1)}%` : 'N/A'), sbc == null ? 'neutral' : sbc < 10 ? 'good' : sbc < 20 ? 'warn' : 'bad', sbc == null ? '-' : sbc < 10 ? 'Low' : sbc < 20 ? 'Med' : 'High', 'Stock-based comp/Net income. >30% = dilution risk'),
        def('SBC / Revenue', pct(sbcRev), undefined, sbcRev == null ? 'neutral' : sbcRev < 0.03 ? 'good' : sbcRev < 0.08 ? 'warn' : 'bad', sbcRev == null ? '-' : sbcRev < 0.03 ? 'Low' : sbcRev < 0.08 ? 'Med' : 'High', 'Stock-based comp / Revenue (latest period)'),
    ];

    const valuation: MetricCardDef[] = [
        def('Market Cap', fmtB(mcap), s(fmtB(smcap)), 'neutral', 'Size', 'Current Market Capitalization'),
        def('P/E (TTM)', pe != null ? `${pe.toFixed(1)}x` : 'N/A', s(spe != null ? `${spe.toFixed(1)}x` : 'N/A'), pe == null ? 'neutral' : pe < 15 ? 'good' : pe <= 25 ? 'neutral' : pe <= 35 ? 'warn' : 'bad', pe == null ? '-' : pe < 15 ? 'Cheap' : pe <= 25 ? 'Fair' : 'Exp.', 'Price to Earnings', pe != null ? (pe / 40) * 100 : undefined),
        def('Forward P/E', fpe != null ? `${fpe.toFixed(1)}x` : 'N/A', s(sfpe != null ? `${sfpe.toFixed(1)}x` : 'N/A'), fpe == null ? 'neutral' : fpe < 15 ? 'good' : fpe <= 25 ? 'neutral' : fpe <= 35 ? 'warn' : 'bad', fpe == null ? '-' : fpe < 15 ? 'Cheap' : fpe <= 25 ? 'Fair' : 'Exp.', 'Price / next-year EPS estimate — shows whether the TTM multiple is rich or just front-loading growth', fpe != null ? (fpe / 40) * 100 : undefined),
        def('EV/EBITDA', evEbitda != null ? `${evEbitda.toFixed(1)}x` : 'N/A', s(sevEbitda != null ? `${sevEbitda.toFixed(1)}x` : 'N/A'), evEbitda == null ? 'neutral' : evEbitda < 12 ? 'good' : evEbitda <= 18 ? 'neutral' : evEbitda <= 25 ? 'warn' : 'bad', evEbitda == null ? '-' : evEbitda < 12 ? 'Cheap' : evEbitda <= 18 ? 'Fair' : 'Exp.', 'Enterprise value / EBITDA — capital-structure neutral, works where P/E distorts (debt, D&A)', evEbitda != null ? (evEbitda / 30) * 100 : undefined),
        def('P/S (TTM)', psRatio != null ? `${psRatio.toFixed(2)}x` : 'N/A', s(spsRatio != null ? `${spsRatio.toFixed(2)}x` : 'N/A'), psRatio == null ? 'neutral' : psRatio < 2 ? 'good' : psRatio <= 5 ? 'neutral' : psRatio <= 10 ? 'warn' : 'bad', psRatio == null ? '-' : psRatio < 2 ? 'Cheap' : psRatio <= 5 ? 'Fair' : 'Exp.', 'Price to Sales', psRatio != null ? (psRatio / 15) * 100 : undefined),
        def('P/B Ratio', pbRatio != null ? mul(pbRatio) : (hasNegEquity ? 'Neg. Equity' : 'N/A'), s(spbRatio != null ? mul(spbRatio) : (sHasNegEquity ? 'Neg. Equity' : 'N/A')), pbRatio == null ? (hasNegEquity ? 'warn' : 'neutral') : pbRatio < 3 ? 'good' : pbRatio < 8 ? 'warn' : 'bad', pbRatio == null ? (hasNegEquity ? 'Buybacks' : '-') : pbRatio < 3 ? 'Fair' : pbRatio < 8 ? 'Exp.' : 'V.Exp.', 'Price to Book Value. Neg. equity = heavy buybacks', pbRatio != null ? (pbRatio / 10) * 100 : undefined),
        def('FCF Yield', pct(fcfY), s(pct(sfcfY)), fcfY == null ? 'neutral' : fcfY > 0.05 ? 'good' : fcfY < 0 ? 'bad' : 'warn', fcfY == null ? '-' : fcfY > 0.05 ? 'Value' : fcfY < 0 ? 'Negative' : 'Low', 'FCF / Market Cap', fcfY != null ? Math.max(0, (fcfY / 0.1) * 100) : undefined),
        def('PEG Ratio', peg != null ? `${peg.toFixed(2)}` : 'N/A', s(speg != null ? `${speg.toFixed(2)}` : 'N/A'), peg == null ? 'neutral' : peg < 1 ? 'good' : peg <= 2 ? 'neutral' : peg <= 3 ? 'warn' : 'bad', peg == null ? '-' : peg < 1 ? 'Cheap' : peg <= 2 ? 'Fair' : 'Exp.', 'P/E relative to growth — reads precise but hinges entirely on the growth estimate'),
    ];

    const quality: MetricCardDef[] = [
        def('Piotroski F-Score', pio != null ? `${pio}/9` : 'N/A', s(spio != null ? `${spio}/9` : 'N/A'), pio == null ? 'neutral' : pio >= 7 ? 'good' : pio >= 4 ? 'warn' : 'bad', pio == null ? '-' : pio >= 7 ? 'Strong' : pio >= 4 ? 'Avg' : 'Weak', 'Financial strength 0–9. >7 Strong', pio != null ? (pio / 9) * 100 : undefined),
        def('Beneish M-Score', ben != null ? ben.toFixed(2) : 'N/A', s(sben != null ? sben.toFixed(2) : 'N/A'), ben == null ? 'neutral' : ben < -2.22 ? 'good' : ben < -1.78 ? 'warn' : 'bad', ben == null ? '-' : ben < -2.22 ? 'Safe' : ben < -1.78 ? 'Gray zone' : 'Risky', 'Earnings manipulation risk. < -2.22 Safe', ben != null ? Math.min(100, Math.max(0, ((ben + 3) / 1.5) * 100)) : undefined),
        def('Margin Volatility', mv != null ? `${(mv * 100).toFixed(1)}%` : 'N/A', s(smv != null ? `${(smv * 100).toFixed(1)}%` : 'N/A'), mv == null ? 'neutral' : mv < 0.08 ? 'good' : mv < 0.15 ? 'warn' : 'bad', mv == null ? '-' : mv < 0.08 ? 'Stable' : mv < 0.15 ? 'Avg' : 'Volatile', 'EBIT margin std deviation. Lower = stable'),
        def('Capex / Revenue', pct(capexRev), undefined, capexRev == null ? 'neutral' : capexRev < 0.05 ? 'good' : capexRev < 0.15 ? 'warn' : 'bad', capexRev == null ? '-' : capexRev < 0.05 ? 'Asset-light' : capexRev < 0.15 ? 'Avg' : 'Heavy', 'Capital intensity — high % = capital-hungry business'),
    ];

    const balanceSheet: MetricCardDef[] = [
        def('Total Debt', fmtB(bs?.totalDebt), s(fmtB(sbs?.totalDebt)), 'neutral', '-', 'Total debt obligations (short + long term)'),
        def('Cash & Equiv.', fmtB(bs?.cash), s(fmtB(sbs?.cash)), 'neutral', '-', 'Cash and short-term investments'),
        def('Net Debt', fmtB(bs?.netDebt), s(fmtB(sbs?.netDebt)), bs?.netDebt != null ? (bs.netDebt < 0 ? 'good' : 'neutral') : 'neutral', bs?.netDebt != null && bs.netDebt < 0 ? 'Net Cash' : '-', 'Total Debt minus Cash. Negative = Net Cash position'),
        def('Total Equity', fmtB(bs?.totalEquity), s(fmtB(sbs?.totalEquity)), 'neutral', '-', "Shareholders' equity (book value)"),
        def('Asset / Liability', bs?.assetToLiability != null ? `${bs.assetToLiability.toFixed(2)}x` : 'N/A', s(sbs?.assetToLiability != null ? `${sbs.assetToLiability.toFixed(2)}x` : 'N/A'), bs?.assetToLiability == null ? 'neutral' : bs.assetToLiability >= 2 ? 'good' : bs.assetToLiability >= 1 ? 'warn' : 'bad', bs?.assetToLiability == null ? '-' : bs.assetToLiability >= 2 ? 'Solid' : bs.assetToLiability >= 1 ? 'Adequate' : 'Risky', 'Total Assets / Total Liabilities', bs?.assetToLiability != null ? Math.min(100, (bs.assetToLiability / 3) * 100) : undefined),
    ];


    const scoreStatus = (v: number | null | undefined): StatusType =>
        v == null ? 'neutral' : v >= 75 ? 'good' : v >= 50 ? 'warn' : 'bad';
    const scoreLabel = (v: number | null | undefined) =>
        v == null ? '-' : v >= 75 ? 'Strong' : v >= 50 ? 'Moderate' : 'Weak';
    const scoreDef = (label: string, v: number | null | undefined, hint: string): MetricCardDef =>
        def(label, v != null ? `${v.toFixed(0)}/100` : 'N/A', undefined, scoreStatus(v), scoreLabel(v), hint, v != null ? v : undefined);

    const scores: MetricCardDef[] = [
        scoreDef('Health Score', data.healthScore, 'Composite score across profitability, solvency, growth and quality'),
        scoreDef('Profitability Score', data.profitabilityScore, 'Margins, returns and cash-generation strength'),
        scoreDef('Valuation Score', data.valuationScore, 'How attractively the stock is priced vs fundamentals'),
    ];

    return { scores, solvency, profitability, growth, valuation, quality, balanceSheet, lossYears: niYrs };
}

// ── Sub-component for Grid Section ───────────────────────────────────────────
function MetricGrid({ title, metrics, compareWith, children }: { title: string, metrics: MetricCardDef[], compareWith: string, children?: React.ReactNode }) {
    return (
        <div className="break-inside-avoid bg-white dark:bg-[#15171e] rounded-2xl p-4 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-gray-100 dark:border-gray-800/80 mb-4 sm:mb-6">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">{title}</h3>
                {children}
            </div>
            <div className="flex flex-col">
                {metrics.map((m) => (
                    <CompactMetricRow key={m.label} card={m} compareWith={compareWith} />
                ))}
            </div>
        </div>
    );
}

// ── Main export ──────────────────────────────────────────────────────────────
export function FinancialHealthTable({ data, compareWith, secondaryData, flowPeriods }: Props) {
    const { scores, solvency, profitability, growth, valuation, quality, balanceSheet, lossYears } = useMemo(
        () => buildMetrics(data, secondaryData, compareWith, flowPeriods),
        [data, secondaryData, compareWith, flowPeriods]
    );

    return (
        <div className="bg-transparent">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Key Financial Metrics</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Comprehensive view of financial health, valuation, and quality</p>
                    </div>
                </div>
            </div>

            {/* Score legend — applies to the Scores group below */}
            {(data.healthScore != null || data.profitabilityScore != null || data.valuationScore != null) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500 dark:text-gray-500 mb-6 px-1">
                    <span className="font-semibold uppercase tracking-wider">Scores:</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>80-100 Excellent</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span>50-79 Average</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>0-49 Weak</span>
                </div>
            )}

            {/* Sections */}
            <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 sm:gap-6">
                <MetricGrid title="Scores" metrics={scores} compareWith={compareWith} />
                <MetricGrid title="Profitability" metrics={profitability} compareWith={compareWith}>
                    {lossYears > 0 && (
                        <StatusBadge label={`${lossYears} Loss Years (10Y)`} type={lossYears <= 2 ? 'warn' : 'bad'} />
                    )}
                </MetricGrid>
                <MetricGrid title="Valuation" metrics={valuation} compareWith={compareWith} />
                <MetricGrid title="Growth & Dilution" metrics={growth} compareWith={compareWith} />
                <MetricGrid title="Solvency & Debt" metrics={solvency} compareWith={compareWith} />
                <MetricGrid title="Quality & Risk" metrics={quality} compareWith={compareWith} />
                <MetricGrid title="Balance Sheet" metrics={balanceSheet} compareWith={compareWith} />
            </div>

            {/* Verdict + human-readable callouts (previously the Health Scores card) */}
            {(data.verdictText || data.humanDebtInfo || data.humanPeInfo) && (
                <div className="mt-2 px-1 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    {data.verdictText && <p className="leading-relaxed">{data.verdictText}</p>}
                    {(data.humanDebtInfo || data.humanPeInfo) && (
                        <p>{[data.humanDebtInfo, data.humanPeInfo].filter(Boolean).join(' · ')}</p>
                    )}
                </div>
            )}

            {/* Shared as-of: statements period + ratio snapshot freshness */}
            {(data.statements?.[0]?.endDate || data.finnhub?.fetchedAt) && (
                <p className="mt-3 px-1 text-[10px] text-gray-400 dark:text-gray-500">
                    {[
                        data.statements?.[0]?.endDate && `Financials as of ${new Date(data.statements[0].endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
                        data.finnhub?.fetchedAt && `Ratio snapshot ${new Date(data.finnhub.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
                    ].filter(Boolean).join(' · ')}
                </p>
            )}
        </div>
    );
}
