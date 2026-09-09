'use client';

import React, { useCallback } from 'react';

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
  const handleMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (val <= valueMax) onChangeMin(val);
  }, [valueMax, onChangeMin]);

  const handleMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (val >= valueMin) onChangeMax(val);
  }, [valueMin, onChangeMax]);

  const minPct = ((valueMin - min) / (max - min)) * 100;
  const maxPct = ((valueMax - min) / (max - min)) * 100;

  type AccentStyle = { fill: string; thumb: string; text: string };
  const styles: Record<string, AccentStyle> = {
    blue: { fill: 'bg-blue-500', thumb: '[&::-webkit-slider-thumb]:bg-blue-600 [&::-moz-range-thumb]:bg-blue-600', text: 'text-blue-600 dark:text-blue-400' },
    emerald: { fill: 'bg-emerald-500', thumb: '[&::-webkit-slider-thumb]:bg-emerald-600 [&::-moz-range-thumb]:bg-emerald-600', text: 'text-emerald-600 dark:text-emerald-400' },
    violet: { fill: 'bg-violet-500', thumb: '[&::-webkit-slider-thumb]:bg-violet-600 [&::-moz-range-thumb]:bg-violet-600', text: 'text-violet-600 dark:text-violet-400' },
  };
  const s: AccentStyle = styles[accentColor] ?? { fill: 'bg-blue-500', thumb: '[&::-webkit-slider-thumb]:bg-blue-600 [&::-moz-range-thumb]:bg-blue-600', text: 'text-blue-600 dark:text-blue-400' };

  return (
    <div className="flex flex-col gap-1.5 min-w-[160px] flex-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-wide">
          {label}
        </label>
        <div className="flex items-center gap-1 text-[11px] font-semibold tabular-nums">
          <span className={s.text}>{valueMin}</span>
          <span className="text-gray-300 dark:text-gray-600">–</span>
          <span className={s.text}>{valueMax}</span>
        </div>
      </div>
      <div className="relative h-5 flex items-center">
        {/* Track */}
        <div className="absolute w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        {/* Fill */}
        <div
          className={`absolute h-1 ${s.fill} rounded-full pointer-events-none transition-all`}
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        {/* Min input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={handleMinChange}
          className={`absolute w-full h-5 appearance-none bg-transparent pointer-events-none
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-125
            [&::-webkit-slider-thumb]:active:cursor-grabbing
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-grab
            [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:active:scale-125
            ${s.thumb}`}
          style={{ zIndex: valueMin > max - (max - min) * 0.15 ? 5 : 3 }}
        />
        {/* Max input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={handleMaxChange}
          className={`absolute w-full h-5 appearance-none bg-transparent pointer-events-none
            [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-125
            [&::-webkit-slider-thumb]:active:cursor-grabbing
            [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-grab
            [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:active:scale-125
            ${s.thumb}`}
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  );
}
