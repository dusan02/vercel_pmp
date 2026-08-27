import React from 'react';
import { getColorClass, getStrokeColor } from './ScoreCard';

interface ScoreRingsProps {
  healthScore: number | null;
  profitabilityScore: number | null;
  valuationScore: number | null;
  verdictText: string | null;
}

function MiniScoreRing({ label, score }: { label: string; score: number | null }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const hasScore = score != null && !isNaN(score);
  const displayScore = hasScore ? score : 0;
  const strokeDashoffset = hasScore ? circumference - (displayScore / 100) * circumference : circumference;
  const color = getColorClass(score);
  const stroke = getStrokeColor(score);

  return (
    <div className="flex flex-col items-center gap-1" title={`${label}: ${score ?? 'N/A'}/100`}>
      <div className="relative w-[48px] h-[48px]">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="currentColor" strokeWidth="10" className="text-gray-100 dark:text-gray-700" />
          {hasScore && (
            <circle
              cx="50" cy="50" r={radius} fill="transparent"
              stroke={stroke} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              className="transition-all duration-700 ease-out"
              role="progressbar"
              aria-valuenow={score ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${label} score`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-sm font-bold ${color}`}>{score ?? '—'}</span>
        </div>
      </div>
      <span className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">{label}</span>
    </div>
  );
}

export function ScoreRings({ healthScore, profitabilityScore, valuationScore, verdictText }: ScoreRingsProps) {
  const hasAnyScore = healthScore != null || profitabilityScore != null || valuationScore != null;
  if (!hasAnyScore && !verdictText) return null;

  return (
    <div className="hidden md:flex items-center gap-4 lg:gap-5 px-4 lg:px-6 border-l border-gray-100 dark:border-gray-700/60">
      {healthScore != null && <MiniScoreRing label="Health" score={healthScore} />}
      {profitabilityScore != null && <MiniScoreRing label="Profit" score={profitabilityScore} />}
      {valuationScore != null && <MiniScoreRing label="Value" score={valuationScore} />}
      {verdictText && (
        <div className="flex flex-col items-center gap-1 min-w-[60px]">
          <div className="flex items-center justify-center w-[48px] h-[48px] rounded-full bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 text-center leading-tight px-1">
              {verdictText.length > 8 ? verdictText.slice(0, 7) + '…' : verdictText}
            </span>
          </div>
          <span className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">AI Verdict</span>
        </div>
      )}
    </div>
  );
}
