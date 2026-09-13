'use client';

import { useEffect, useRef, useState } from 'react';

interface LivePriceProps {
  value: number | null | undefined;
  format: (v: number) => string;
  /** Additional classes for the wrapper span */
  className?: string;
}

/**
 * Price cell that flashes green/red for ~1.2s whenever the value changes
 * (live WebSocket updates). The flash gives visual feedback that the data
 * is alive — a key "liveness" signal for a market-data product.
 */
export function LivePrice({ value, format, className = '' }: LivePriceProps) {
  const prevRef = useRef<number | null | undefined>(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (value != null && prev != null && value !== prev) {
      setFlash(value > prev ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 1200);
      prevRef.current = value;
      return () => clearTimeout(t);
    }
    prevRef.current = value;
  }, [value]);

  return (
    <span
      className={`font-mono tabular-nums font-semibold transition-colors duration-700 ${
        flash === 'up'
          ? 'text-emerald-500'
          : flash === 'down'
            ? 'text-red-500'
            : ''
      } ${className}`}
    >
      {value != null && isFinite(value) ? format(value) : '—'}
    </span>
  );
}
