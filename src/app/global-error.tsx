'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global Error:', error);

    const isChunkLoadError = error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk');

    if (isChunkLoadError) {
      if (typeof window !== 'undefined') {
        const key = 'global_chunk_load_error_reload';
        const now = Date.now();
        const lastReload = parseInt(sessionStorage.getItem(key) || '0', 10);

        // Reload only if we haven't reloaded in the last 10 seconds
        if (now - lastReload > 10000) {
          sessionStorage.setItem(key, now.toString());
          window.location.reload();
        }
      }
    }
  }, [error]);

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

