/**
 * Formátuje číslo na miliardy s "B" suffixom
 * Príklad: 3500 → "3,500 B"
 */
export const formatBillions = (num: number) =>
  Intl.NumberFormat("en-US", { 
    maximumFractionDigits: 0 
  }).format(num);

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
 * Formátuje market cap diff s + alebo - prefixom
 * Príklad: 1.23 → "+1.23", -2.45 → "-2.45"
 */
export const formatMarketCapDiff = (diff: number | null | undefined): string => {
  if (diff === null || diff === undefined) {
    return '0.00';
  }
  const value = Number(diff);
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}; 