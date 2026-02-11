'use client'; // Error components must be Client Components

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('App Error:', error);

    const isChunkLoadError = error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk');

    if (isChunkLoadError) {
      if (typeof window !== 'undefined') {
        const key = 'chunk_load_error_reload';
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-lg overflow-auto">
        <p className="font-mono text-sm">{error.message}</p>
        {error.digest && <p className="text-xs mt-2">Digest: {error.digest}</p>}
      </div>
      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}

