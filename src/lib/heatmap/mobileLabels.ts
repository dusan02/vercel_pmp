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

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const EMPTY: MobileTileLabel = {
  showSymbol: false, showValue: false, symbol: '', value: '', symbolFontPx: 0, valueFontPx: 0,
};

// Approx width of an uppercase character relative to its font size (Inter/Space Grotesk, bold).
const CHAR_W_RATIO = 0.62;
// Digits/percent glyphs are narrower than uppercase letters.
const VALUE_CHAR_W_RATIO = 0.56;
// Readability floors (px). Below these the text is not comfortably readable on mobile.
const MIN_SYMBOL_PX = 9;
const MIN_VALUE_PX = 8;

/**
 * 3-tier mobile tile labels (no expensive DOM text measurement):
 *
 *  - Tier 0 (tiny, minDim < 13px):  no text — the tile renders a dot indicator.
 *  - Tier 1 (small):                ticker only. Font shrinks to fit; as a last
 *                                   resort the ticker is truncated so SOMETHING
 *                                   is always shown when there's any room.
 *  - Tier 2 (medium+, minDim >= 32):ticker + value on two lines (only when both
 *                                   lines fit comfortably).
 */
export function getMobileTileLabel(
  company: CompanyNode,
  w: number,
  h: number,
  metric: HeatmapMetric
): MobileTileLabel {
  const pad = 3; // small inset from borders
  const maxW = w - pad * 2;
  const maxH = h - pad * 2;
  const minDim = Math.min(w, h);

  // Tier 0 — too small for any readable text.
  if (minDim < 13 || maxW <= 2 || maxH <= 2) return EMPTY;

  const symbolText = (company.symbol ?? '').toUpperCase();
  if (!symbolText) return EMPTY;

  const valueText = metric === 'percent'
    ? formatPercent(company.changePercent ?? 0)
    : (company.marketCapDiff == null ? '' : formatMarketCapDiff(company.marketCapDiff));

  // ── Tier 1: symbol sizing ──────────────────────────────────────────
  // Ideal font scales with tile size, capped by the box height (single line).
  const idealSymbolPx = Math.round(clamp(minDim * 0.34, MIN_SYMBOL_PX, 22));
  let symbolFontPx = Math.min(idealSymbolPx, Math.floor(maxH));
  let displaySymbol = symbolText;

  const widthFor = (chars: number, px: number, ratio = CHAR_W_RATIO) => chars * px * ratio;

  if (widthFor(displaySymbol.length, symbolFontPx) > maxW) {
    // Full ticker doesn't fit at the ideal font — try shrinking the font to fit width.
    const fontByWidth = Math.floor(maxW / (displaySymbol.length * CHAR_W_RATIO));
    if (fontByWidth >= MIN_SYMBOL_PX) {
      symbolFontPx = fontByWidth;
    } else {
      // Last resort: keep the minimum readable font and truncate the ticker.
      symbolFontPx = MIN_SYMBOL_PX;
      const maxChars = Math.floor(maxW / (symbolFontPx * CHAR_W_RATIO));
      if (maxChars < 1) return EMPTY; // genuinely no room even for one char
      displaySymbol = symbolText.slice(0, maxChars);
    }
  }

  // ── Tier 2: value as a second line ─────────────────────────────────
  // Only when the tile is comfortably large AND both lines fit.
  let showValue = false;
  let valueFontPx = 0;
  if (minDim >= 32 && valueText.length > 0) {
    const candidate = Math.round(clamp(symbolFontPx - 3, MIN_VALUE_PX, 14));
    const valueFitsW = widthFor(valueText.length, candidate, VALUE_CHAR_W_RATIO) <= maxW;
    const twoLinesFitH = symbolFontPx + candidate + 3 <= maxH;
    if (valueFitsW && twoLinesFitH) {
      showValue = true;
      valueFontPx = candidate;
    }
  }

  return {
    showSymbol: true,
    showValue,
    symbol: displaySymbol,
    value: valueText,
    symbolFontPx,
    valueFontPx: valueFontPx || Math.round(clamp(symbolFontPx - 3, MIN_VALUE_PX, 12)),
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

