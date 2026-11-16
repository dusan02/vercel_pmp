/**
 * Instant route-transition skeleton for /analysis/[ticker].
 * Matches AnalysisPage shell under AnalysisLayout's PageHeader so clicking a
 * heatmap tile gives immediate feedback even on cold ISR renders.
 */
export default function AnalysisTickerLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" aria-busy="true" aria-label="Loading stock analysis">
      {/* Breadcrumb + search bar placeholder */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-4">
          <div className="h-4 w-56 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="hidden sm:block h-8 w-72 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
        </div>
      </div>

      <main className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Ticker navigator strip */}
        <div className="h-9 w-full rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 animate-pulse" />

        {/* Row 1: Hero + 6-Axis Radar */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23.5rem]">
          <div className="h-64 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
            <div className="h-7 w-48 rounded bg-gray-200 dark:bg-gray-700 mb-3" />
            <div className="h-10 w-36 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
            <div className="h-4 w-full max-w-xl rounded bg-gray-200 dark:bg-gray-700 mb-2" />
            <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-64 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 animate-pulse" />
        </div>

        {/* Row 2: Price History / Chart / Key Metrics */}
        <div className="h-80 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 animate-pulse" />
      </main>
    </div>
  );
}
