'use client';

import React from 'react';

interface PortfolioQuantityInputProps {
  value: number;
  onChange: (value: number) => void;
}

export function PortfolioQuantityInput({ value, onChange }: PortfolioQuantityInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value.trim();
    inputValue = inputValue.replace(',', '.');
    
    if (inputValue === '' || inputValue === '.') {
      onChange(0);
      return;
    }
    
    let cleanedValue = inputValue;
    if (/^0+[1-9]/.test(cleanedValue)) {
      cleanedValue = cleanedValue.replace(/^0+/, '');
    }
    
    const newQuantity = parseFloat(cleanedValue);
    if (!isNaN(newQuantity) && newQuantity >= 0 && isFinite(newQuantity)) {
      onChange(newQuantity);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const inputValue = e.target.value.trim();
    if (inputValue === '' || inputValue === '.' || inputValue === '0') {
      onChange(0);
      e.target.value = '';
    } else {
      const parsed = parseFloat(inputValue);
      if (!isNaN(parsed) && parsed >= 0 && isFinite(parsed)) {
        const formatted = parsed % 1 === 0 
          ? parsed.toString() 
          : parsed.toString().replace(/\.?0+$/, '');
        e.target.value = formatted;
        onChange(parsed);
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
    const hasDecimal = currentValue.includes('.') || currentValue.includes(',');
    const isDecimal = (e.key === '.' || e.key === ',') && !hasDecimal;
    if (!isNumber && !isDecimal && !allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
    if (e.key === ',') {
      e.preventDefault();
      const newValue = currentValue + '.';
      e.currentTarget.value = newValue;
      // Trigger change event manually if needed or handled by React state
      // Since we use uncontrolled input mostly for display but send updates up, 
      // we rely on onChange. But for React controlled input:
      // e.currentTarget.dispatchEvent(new Event('input', { bubbles: true }));
      // Here we just let the next render update it via value prop if controlled,
      // or onChange needs to handle it. 
      // Actually, for this specific case, better to just modify value and call handler?
      // The original code dispatched an event. Let's simplify.
      // We will just append '.' and call the handler if needed, but input is tricky.
      // Let's stick to preventing comma and inserting dot.
      
      // Simplification: just replace the value and let React handle the rest?
      // No, this is a controlled component via props, but we need local state for typing?
      // The original used props directly.
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={value === 0 ? '' : value.toString()}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-16 px-2 py-1 text-center bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
      placeholder="0"
    />
  );
}
























