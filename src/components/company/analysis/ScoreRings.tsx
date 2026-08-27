import React from 'react';
import { getColorClass } from './ScoreCard';

interface ScoreRingsProps {
  healthScore: number | null;
  profitabilityScore: number | null;
  valuationScore: number | null;
  verdictText: string | null;
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const hasScore = score != null && !isNaN(score);
  const pct = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const color = getColorClass(score);

  // Bar fill color based on score
  const barColor = !hasScore ? '#d1d5db' : score! <= 40 ? '#ef4444' : score! <= 70 ? '#eab308' : '#22c55e';

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 w-[52px] shrink-0">{label}</span>
      <div className="relative flex-1 h-5 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden min-w-[80px]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
          role="progressbar"
          aria-valuenow={score ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} score`}
        />
        <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold ${hasScore ? color : 'text-gray-400'}`}>
          {score ?? '—'}
          {hasScore && <span className="text-[8px] text-gray-400 ml-0.5">/100</span>}
        </span>
      </div>
    </div>
  );
}

function VerdictBar({ verdict }: { verdict: string }) {
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 w-[52px] shrink-0">Verdict</span>
      <div className="flex-1 h-5 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center min-w-[80px] border border-gray-100 dark:border-gray-700">
        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 px-2 truncate">
          {verdict}
        </span>
      </div>
    </div>
  );
}

export function ScoreRings({ healthScore, profitabilityScore, valuationScore, verdictText }: ScoreRingsProps) {
  const hasAnyScore = healthScore != null || profitabilityScore != null || valuationScore != null;
  if (!hasAnyScore && !verdictText) return null;

  return (
    <div className="hidden md:flex flex-col gap-2 px-4 lg:px-6 border-l border-gray-100 dark:border-gray-700/60 w-[240px] lg:w-[280px] shrink-0">
      {healthScore != null && <ScoreBar label="Health" score={healthScore} />}
      {profitabilityScore != null && <ScoreBar label="Profit" score={profitabilityScore} />}
      {valuationScore != null && <ScoreBar label="Value" score={valuationScore} />}
      {verdictText && <VerdictBar verdict={verdictText} />}
    </div>
  );
}
