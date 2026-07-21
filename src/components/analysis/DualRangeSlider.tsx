'use client';

import React, { useRef, useCallback } from 'react';

interface DualRangeSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (val: number) => void;
  onChangeMax: (val: number) => void;
  accentColor?: string;
}

export function DualRangeSlider({
  label,
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
  accentColor = 'blue',
}: DualRangeSliderProps) {
  const rangeRef = useRef<HTMLDivElement>(null);

  const handleMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (val <= valueMax) {
      onChangeMin(val);
    }
  }, [valueMax, onChangeMin]);

  const handleMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (val >= valueMin) {
      onChangeMax(val);
    }
  }, [valueMin, onChangeMax]);

  // Calculate percentage positions for the track fill
  const minPct = ((valueMin - min) / (max - min)) * 100;
  const maxPct = ((valueMax - min) / (max - min)) * 100;

  type AccentStyle = { bg: string; range: string; text: string };
  const accentClasses: Record<string, AccentStyle> = {
    blue: { bg: 'bg-blue-500', range: 'accent-blue-600', text: 'text-blue-600 dark:text-blue-400' },
    green: { bg: 'bg-green-500', range: 'accent-green-600', text: 'text-green-600 dark:text-green-400' },
    purple: { bg: 'bg-purple-500', range: 'accent-purple-600', text: 'text-purple-600 dark:text-purple-400' },
  };
  const c: AccentStyle = accentClasses[accentColor] ?? { bg: 'bg-blue-500', range: 'accent-blue-600', text: 'text-blue-600 dark:text-blue-400' };

  return (
    <div className="flex flex-col gap-2 min-w-[180px]">
      <label className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
        {label}
      </label>
      <div className="flex items-center gap-2 text-xs font-mono font-bold mb-1">
        <span className={`${c.text} bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded`}>{valueMin}</span>
        <span className="text-gray-300 dark:text-gray-600">—</span>
        <span className={`${c.text} bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded`}>{valueMax}</span>
      </div>
      <div ref={rangeRef} className="relative h-6 flex items-center">
        {/* Track background */}
        <div className="absolute w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full" />
        {/* Track fill */}
        <div
          className={`absolute h-2 ${c.bg} rounded-full pointer-events-none`}
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        {/* Min range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={handleMinChange}
          className={`absolute w-full h-6 appearance-none bg-transparent ${c.range} pointer-events-none
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-500
            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-500
            [&::-moz-range-thumb]:cursor-pointer`}
          style={{ zIndex: valueMin > max - (max - min) * 0.1 ? 5 : 3 }}
        />
        {/* Max range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={handleMaxChange}
          className={`absolute w-full h-6 appearance-none bg-transparent ${c.range} pointer-events-none
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-500
            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-500
            [&::-moz-range-thumb]:cursor-pointer`}
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  );
}
