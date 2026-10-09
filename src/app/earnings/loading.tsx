export default function EarningsLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
        <div className="h-9 w-72 bg-slate-200 dark:bg-slate-800 rounded mb-2" />
        <div className="h-5 w-96 bg-slate-200 dark:bg-slate-800 rounded mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <div className="h-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
