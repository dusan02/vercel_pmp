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

  // Too small → no text at all
  if (minDim < 18) {
    return { showSymbol: false, showValue: false, symbol: '', value: '', symbolFontPx: 0, valueFontPx: 0 };
  }

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const symbolFontPx = Math.round(clamp(minDim * 0.28, 9, 16));
  const showValue = minDim >= 34; // value line needs more room
  const valueFontPx = Math.round(clamp(symbolFontPx - 4, 8, 12));

  const valueText = metric === 'percent'
    ? formatPercent(company.changePercent ?? 0)
    : (company.marketCapDiff == null ? '' : formatMarketCapDiff(company.marketCapDiff));

  return {
    showSymbol: true,
    showValue: showValue && valueText.length > 0,
    symbol: company.symbol,
    value: valueText,
    symbolFontPx,
    valueFontPx,
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

