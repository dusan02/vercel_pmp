'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function EarningsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Earnings page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Earnings calendar unavailable
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          We couldn't load the earnings data right now. This is usually temporary.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:underline"
          >
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
