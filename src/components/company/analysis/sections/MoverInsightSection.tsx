interface MoverInsightSectionProps {
  ticker: string;
  moversReason: string | null | undefined;
  moversCategory: string | null | undefined;
  aiConfidence: number | null | undefined;
  isSbcAlert: boolean | null | undefined;
  changePct: number | null | undefined;
}

export function MoverInsightSection({
  ticker,
  moversReason,
  moversCategory,
  aiConfidence,
  isSbcAlert,
  changePct,
}: MoverInsightSectionProps) {
  // Only show when there is an AI insight AND the stock is actually moving
  if (!moversReason || changePct == null || Math.abs(changePct) < 2) return null;

  const moveUp = changePct >= 0;

  return (
    <section className="mb-6">
      <div
        className={`rounded-2xl border p-5 sm:p-6 ${
          isSbcAlert
            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50'
            : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
              moveUp
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {moveUp ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h7v7M20 7l-7 7M5 17H4a1 1 0 01-1-1V5a1 1 0 011-1h1m4 0h4m-4 0V3a1 1 0 011-1h2a1 1 0 011 1v1m-4 0h4" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 17H4v-7m0 7l7-7M19 7h1a1 1 0 011 1v11a1 1 0 01-1 1h-1m-4 0h-4m4 0v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2m4 0h-4" />
              )}
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Why is {ticker} moving?
              </h2>
              {moversCategory && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  {moversCategory}
                </span>
              )}
              {isSbcAlert && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white">
                  SBC Alert                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{moversReason}</p>
            {aiConfidence != null && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <span>AI confidence:</span>
                <span
                  className={`font-bold ${
                    aiConfidence >= 75
                      ? 'text-green-600 dark:text-green-400'
                      : aiConfidence >= 50
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-gray-400'
                  }`}
                >
                  {aiConfidence >= 75 ? 'High' : aiConfidence >= 50 ? 'Medium' : 'Low'} ({aiConfidence}%)
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className={`font-semibold ${moveUp ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {moveUp ? '+' : ''}
                  {changePct.toFixed(2)}% today
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
