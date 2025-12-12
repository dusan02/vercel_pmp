/**
 * Heatmap Formatting Utilities
 * Number and text formatting functions for heatmap display
 */

/**
 * Formátuje percentuálnu zmenu
 */
export function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/**
 * Formátuje market cap diff na kompaktný tvar (napr. +$34.2B alebo -$1.5B)
 */
export function formatMarketCapDiff(value: number | undefined): string {
  if (value === undefined || value === null || !isFinite(value) || value === 0) {
    return '';
  }
  const absValue = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';

  if (absValue >= 1_000_000_000_000) {
    return `${sign}$${(absValue / 1_000_000_000_000).toFixed(1)}T`;
  } else if (absValue >= 1_000_000_000) {
    return `${sign}$${(absValue / 1_000_000_000).toFixed(1)}B`;
  } else if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
  } else {
    return `${sign}$${absValue.toFixed(0)}`;
  }
}

/**
 * Formátuje cenu akcie na formát s dolármi (napr. $185.50)
 */
export function formatPrice(value: number | undefined): string {
  if (value === undefined || value === null || !isFinite(value) || value === 0) {
    return '';
  }
  return `$${value.toFixed(2)}`;
}

/**
 * Formátuje market cap na kompaktný tvar (napr. 1.2T alebo 350.5B)
 */
export function formatMarketCap(value: number): string {
  if (!isFinite(value) || value === 0) return '0.00';

  if (value >= 1000) {
    const trillions = value / 1000;
    return `${trillions.toFixed(2)}T`;
  } else {
    return `${value.toFixed(2)}B`;
  }
}

