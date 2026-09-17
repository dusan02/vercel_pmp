import React from 'react';

/**
 * Crawlable methodology explainer for heatmap scores/metrics.
 * Pure presentational — renderable on server, works without JS via <details>.
 */
export function HeatmapMethodology({ className }: { className?: string | undefined }) {
  return (
    <details className={`heatmap-methodology text-xs text-gray-500 dark:text-gray-400 leading-relaxed ${className ?? ''}`}>
      <summary className="cursor-pointer select-none font-medium hover:text-gray-700 dark:hover:text-gray-300">
        How are the scores calculated?
      </summary>
      <div className="mt-2 space-y-2">
        <p>
          <strong className="text-gray-600 dark:text-gray-300">Health Score (0–100)</strong> — balance-sheet
          strength, 25 points each: Altman Z-score (bankruptcy risk), current ratio (liquidity),
          interest coverage (ability to service debt) and net debt relative to total assets (leverage).
        </p>
        <p>
          <strong className="text-gray-600 dark:text-gray-300">Profitability Score (0–100)</strong> — 25 points
          each: net margin, gross margin, return on equity (ROE) and year-over-year revenue growth.
        </p>
        <p>
          <strong className="text-gray-600 dark:text-gray-300">Valuation Score (0–100)</strong> — how cheap the
          stock is, 25 points each: current P/E vs. its own historical percentile, free-cash-flow yield,
          price-to-sales and EV/EBIT. Higher score = cheaper.
        </p>
        <p>
          <strong className="text-gray-600 dark:text-gray-300">Piotroski F-Score (0–9)</strong> — nine binary
          checks of profitability, leverage and efficiency trends; 8–9 is strong, 0–2 is weak.
        </p>
        <p>
          Scores are computed daily from SEC filings and Finnhub fundamentals. On the heatmap, green
          indicates favorable values and red unfavorable ones — for valuation multiples (P/E, PEG, EV/EBITDA),
          beta and the Beneish M-score, lower is better. Tiles with missing data are shown in neutral gray.
          Simplified heuristics — not investment advice.
        </p>
      </div>
    </details>
  );
}
