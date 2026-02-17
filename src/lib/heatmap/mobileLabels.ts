import type { CompanyNode, HeatmapMetric } from '@/lib/heatmap/types';
import { formatMarketCapDiff, formatPercent } from '@/lib/utils/format';

export type MobileTileLabel = {
  showSymbol: boolean;
  showValue: boolean;
  symbol: string;
  value: string;
  symbolFontPx: number;
  valueFontPx: number;
};

/**
 * Mobile tile label rules: small, predictable thresholds (no expensive text measurement).
 * Keep behavior aligned with the current MobileTreemapNew logic.
 */
export function getMobileTileLabel(
  company: CompanyNode,
  w: number,
  h: number,
  metric: HeatmapMetric
): MobileTileLabel {
  const minDim = Math.min(w, h);

  // Too small → no text at all (unless zoomed, but caller passes effective size)
  if (minDim < 12) {
    return { showSymbol: false, showValue: false, symbol: '', value: '', symbolFontPx: 0, valueFontPx: 0 };
  }

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const pad = 4; // keep small inset from borders
  const maxW = Math.max(0, w - pad * 2);
  const maxH = Math.max(0, h - pad * 2);
  if (maxW <= 0 || maxH <= 0) {
    return { showSymbol: false, showValue: false, symbol: '', value: '', symbolFontPx: 0, valueFontPx: 0 };
  }

  const baseSymbolFontPx = Math.round(clamp(minDim * 0.28, 9, 16));
  const baseValueFontPx = Math.round(clamp(baseSymbolFontPx - 4, 8, 12));

  const valueText = metric === 'percent'
    ? formatPercent(company.changePercent ?? 0)
    : (company.marketCapDiff == null ? '' : formatMarketCapDiff(company.marketCapDiff));

  const symbolText = (company.symbol ?? '').toUpperCase();
  const approxCharW = 0.62; // uppercase letter width in em-ish

  // Fit ticker to box (width + height). If it can't fit at >=6px, hide it.
  const byWidthSymbol = Math.floor(maxW / Math.max(1, symbolText.length * approxCharW));
  const fittedSymbolFontPx = Math.min(baseSymbolFontPx, byWidthSymbol, Math.floor(maxH));
  if (fittedSymbolFontPx < 6) {
    return { showSymbol: false, showValue: false, symbol: '', value: '', symbolFontPx: 0, valueFontPx: 0 };
  }

  // Decide if we can show value as a second line.
  // Keep existing behavior gate (needs room), then further degrade if it won't fit.
  const wantsValue = minDim >= 34 && valueText.length > 0;
  let showValue = wantsValue;
  let fittedValueFontPx = baseValueFontPx;

  if (showValue) {
    const byWidthValue = Math.floor(maxW / Math.max(1, valueText.length * 0.56));
    // Reserve rough vertical split between symbol/value lines
    const symbolBoxH = Math.max(1, Math.floor(maxH * 0.55));
    const valueBoxH = Math.max(1, Math.floor(maxH * 0.45));
    const fittedSymbolForTwoLines = Math.min(fittedSymbolFontPx, symbolBoxH);
    fittedValueFontPx = Math.min(baseValueFontPx, byWidthValue, valueBoxH);

    // If either line becomes unreadable, degrade to ticker-only.
    if (fittedSymbolForTwoLines < 6 || fittedValueFontPx < 6) {
      showValue = false;
      fittedValueFontPx = 0;
    }
  }

  return {
    showSymbol: true,
    showValue,
    symbol: symbolText,
    value: valueText,
    symbolFontPx: fittedSymbolFontPx,
    valueFontPx: fittedValueFontPx || Math.round(clamp(fittedSymbolFontPx - 4, 8, 12)),
  };
}

/**
 * Optical centering: geometric 50/50 often looks slightly low for all-caps text.
 * Keep the existing 1..4px nudge behavior.
 */
export function getMobileTileOpticalOffsetPx(label: Pick<MobileTileLabel, 'showValue' | 'symbolFontPx' | 'valueFontPx'>): number {
  return Math.min(
    4,
    Math.max(
      1,
      Math.round(
        (label.symbolFontPx || 0) * (label.showValue ? 0.14 : 0.1) +
        (label.showValue ? (label.valueFontPx || 0) * 0.22 : 0)
      )
    )
  );
}

