'use client';

import { useEffect, useState } from 'react';
import { isChunkLoadError, hardReload } from '@/lib/utils/chunkRecovery';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isChunkError] = useState(() => isChunkLoadError(error.message));

  useEffect(() => {
    console.error('App Error:', error);

    if (isChunkError && typeof window !== 'undefined') {
      const key = 'chunk_load_error_reload';
      const now = Date.now();
      const lastReload = parseInt(sessionStorage.getItem(key) || '0', 10);

      if (now - lastReload > 10000) {
        sessionStorage.setItem(key, now.toString());
        void hardReload(key);
      }
    }
  }, [error, isChunkError]);

  if (isChunkError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
        <h2 className="text-2xl font-bold mb-4">Updating app…</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">
          A new version was deployed. Refreshing automatically to get the latest update.
        </p>
        <button
          onClick={() => void hardReload('chunk_load_error_reload')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Reload now
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-lg overflow-auto">
        <p className="font-mono text-sm">{error.message}</p>
        {error.digest && <p className="text-xs mt-2">Digest: {error.digest}</p>}
      </div>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}

