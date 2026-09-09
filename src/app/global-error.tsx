'use client';

import { useEffect, useState } from 'react';
import { isChunkLoadError, hardReload } from '@/lib/utils/chunkRecovery';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isChunkError] = useState(() => isChunkLoadError(error.message));

  useEffect(() => {
    console.error('Global Error:', error);

    if (isChunkError && typeof window !== 'undefined') {
      const key = 'global_chunk_load_error_reload';
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
      <html>
        <body>
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-gray-900 p-4">
            <h2 className="text-2xl font-bold mb-4">Updating app…</h2>
            <p className="text-gray-600 mb-6 text-center max-w-md">
              A new version was deployed. Refreshing automatically to get the latest update.
            </p>
            <button
              onClick={() => void hardReload('global_chunk_load_error_reload')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Reload now
            </button>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-gray-900 p-4">
          <h2 className="text-2xl font-bold mb-4">Critical Error</h2>
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-lg">
            <p>{error.message}</p>
          </div>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

