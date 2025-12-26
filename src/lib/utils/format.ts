/**
 * Formátuje číslo na miliardy s "B" alebo bilióny s "T" suffixom
 * Vstup je v miliardách.
 * Príklad: 3.5 → "3.50 B", 1200 → "1.20 T"
 */
export const formatMarketCap = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !isFinite(value) || value === 0) {
    return '0.00';
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)}T`;
  }
  return `${value.toFixed(2)}B`;
};

/**
 * Legacy wrapper for formatMarketCap
 */
export const formatBillions = (num: number) => formatMarketCap(num);

/**
 * Formátuje cenu na formát s 2 desatinnými miestami
 * Príklad: 1234.5 → "1,234.50"
 */
export const formatPrice = (price: number | null | undefined): string => {
  if (price === null || price === undefined || !isFinite(Number(price))) {
    return '0.00';
  }
  return Number(price).toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

/**
 * Formátuje percentuálnu zmenu s + alebo - prefixom
 * Príklad: 1.23 → "+1.23%", -2.45 → "-2.45%"
 */
export const formatPercent = (percent: number | null | undefined): string => {
  if (percent === null || percent === undefined) {
    return '0.00%';
  }
  const value = Number(percent);
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

/**
 * Formátuje market cap diff s + alebo - prefixom a "B" alebo "T" suffixom
 * Vstup je v miliardách.
 * Príklad: 1.23 → "+1.23 B", 1500 → "+1.50 T"
 */
export const formatMarketCapDiff = (diff: number | null | undefined): string => {
  if (diff === null || diff === undefined || diff === 0) {
    return '0.00';
  }
  const value = Number(diff);
  const absValue = Math.abs(value);
  const sign = value >= 0 ? '+' : '';
  
  if (absValue >= 1000) {
    return `${sign}${(value / 1000).toFixed(2)}T`;
  }
  return `${sign}${value.toFixed(2)}B`;
};

/**
 * Formátuje veľké peňažné sumy (doláre) na kompaktný formát
 * Príklady:
 * - 1,234 → "$1,234" alebo "+$1,234" (ak showPlusSign=true)
 * - 1,234,567 → "$1.23M" alebo "+$1.23M"
 * - 1,234,567,890 → "$1.23B" alebo "+$1.23B"
 * - 1,234,567,890,123 → "$1.23T" alebo "+$1.23T"
 */
export const formatCurrencyCompact = (value: number | null | undefined, showPlusSign: boolean = false): string => {
  if (value === null || value === undefined || !isFinite(value) || value === 0) {
    return '$0';
  }
  
  const absValue = Math.abs(value);
  const sign = value >= 0 ? (showPlusSign ? '+' : '') : '-';
  
  // Trillions
  if (absValue >= 1_000_000_000_000) {
    return `${sign}$${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  
  // Billions
  if (absValue >= 1_000_000_000) {
    return `${sign}$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  
  // Millions
  if (absValue >= 1_000_000) {
    return `${sign}$${(value / 1_000_000).toFixed(2)}M`;
  }
  
  // Thousands and below - use standard formatting with commas
  return `${sign}$${Math.round(value).toLocaleString('en-US')}`;
}; 