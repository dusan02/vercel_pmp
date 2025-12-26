'use client';

import React from 'react';

interface PortfolioQuantityInputProps {
  value: number;
  onChange: (value: number) => void;
}

const MAX_QUANTITY = 1000000; // 1,000,000 limit

export function PortfolioQuantityInput({ value, onChange }: PortfolioQuantityInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value.trim();
    
    // Remove all commas (thousand separators) for parsing
    // Keep the original for display if user is typing
    const cleanedForParsing = inputValue.replace(/,/g, '');
    
    // Handle decimal point - replace comma with dot if it's a decimal separator
    const hasDecimalComma = cleanedForParsing.includes(',');
    const cleanedValue = hasDecimalComma ? cleanedForParsing.replace(',', '.') : cleanedForParsing;
    
    if (cleanedValue === '' || cleanedValue === '.') {
      onChange(0);
      return;
    }
    
    // Remove leading zeros
    let finalValue = cleanedValue;
    if (/^0+[1-9]/.test(finalValue)) {
      finalValue = finalValue.replace(/^0+/, '');
    }
    
    // Prevent scientific notation input (e.g., "1e+210")
    if (/[eE]/.test(finalValue)) {
      // If scientific notation detected, reject it
      e.target.value = value === 0 ? '' : Math.min(value, MAX_QUANTITY).toLocaleString('en-US', { notation: 'standard' });
      return;
    }
    
    const newQuantity = parseFloat(finalValue);
    // Enforce MAX_QUANTITY limit strictly
    if (!isNaN(newQuantity) && newQuantity >= 0 && isFinite(newQuantity) && !isNaN(newQuantity)) {
      if (newQuantity > MAX_QUANTITY) {
        // Cap at max if exceeded
        onChange(MAX_QUANTITY);
        // Update input display
        e.target.value = MAX_QUANTITY.toLocaleString('en-US', { notation: 'standard' });
      } else {
        onChange(newQuantity);
      }
    } else if (isNaN(newQuantity) || !isFinite(newQuantity)) {
      // Invalid input - reset to current value or 0
      e.target.value = value === 0 ? '' : Math.min(value, MAX_QUANTITY).toLocaleString('en-US', { notation: 'standard' });
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let inputValue = e.target.value.trim();
    
    // Remove all commas for parsing
    const cleanedForParsing = inputValue.replace(/,/g, '');
    
    // Prevent scientific notation
    if (/[eE]/.test(cleanedForParsing)) {
      // Reset to valid value
      const safeValue = value > MAX_QUANTITY ? MAX_QUANTITY : (value || 0);
      e.target.value = safeValue === 0 ? '' : safeValue.toLocaleString('en-US', { notation: 'standard' });
      onChange(safeValue);
      return;
    }
    
    if (cleanedForParsing === '' || cleanedForParsing === '.' || cleanedForParsing === '0') {
      onChange(0);
      e.target.value = '';
    } else {
      const parsed = parseFloat(cleanedForParsing);
      if (!isNaN(parsed) && parsed >= 0 && isFinite(parsed) && parsed <= MAX_QUANTITY) {
        // Format with commas for display - prevent scientific notation
        const formatted = parsed % 1 === 0 
          ? parsed.toLocaleString('en-US', { notation: 'standard' })
          : parsed.toLocaleString('en-US', { maximumFractionDigits: 2, notation: 'standard' });
        e.target.value = formatted;
        onChange(parsed);
      } else if (parsed > MAX_QUANTITY || !isFinite(parsed)) {
        // Cap at max if exceeded or invalid
        e.target.value = MAX_QUANTITY.toLocaleString('en-US', { notation: 'standard' });
        onChange(MAX_QUANTITY);
      } else {
        onChange(0);
        e.target.value = '';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 
      'ArrowUp', 'ArrowDown', 'Tab', 'Enter'
    ];
    const isNumber = /[0-9]/.test(e.key);
    const currentValue = e.currentTarget.value;
    
    // Allow comma as thousand separator (but not as decimal separator)
    // We'll handle comma formatting in handleChange
    const isComma = e.key === ',';
    const isDecimal = e.key === '.';
    const hasDecimal = currentValue.includes('.');
    
    // Allow comma and decimal point, but only one decimal point
    if (!isNumber && !isComma && !(isDecimal && !hasDecimal) && !allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
  };

  // Format value for display with commas
  // Ensure value is within valid range and not in scientific notation
  const safeValue = (value === 0 || !isFinite(value) || value < 0) 
    ? 0 
    : Math.min(Math.max(0, value), MAX_QUANTITY);
  
  // Format for display - prevent scientific notation
  const displayValue = safeValue === 0 
    ? '' 
    : safeValue >= 1_000_000
      ? MAX_QUANTITY.toLocaleString('en-US') // Cap display at max
      : safeValue % 1 === 0
        ? safeValue.toLocaleString('en-US', { maximumFractionDigits: 0, notation: 'standard' })
        : safeValue.toLocaleString('en-US', { maximumFractionDigits: 2, notation: 'standard' });
  
  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="min-w-[100px] w-24 px-2 py-1 text-center bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
      placeholder="0"
      maxLength={9} // "1,000,000" = 9 characters
      title={`Maximum: ${MAX_QUANTITY.toLocaleString('en-US')}`}
    />
  );
}































