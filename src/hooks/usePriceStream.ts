'use client';

import { useEffect, useRef, useState } from 'react';
import type { PriceUpdate } from '@/lib/types';

/**
 * Live price stream via Socket.IO (server.ts attaches socket.io in production).
 *
 * - Subscribes to the `priceUpdate` broadcast (top 100 tickers + user favorites)
 * - Re-subscribes favorites whenever the set changes
 * - Fails silently when the WebSocket server is not available (e.g. plain
 *   `next dev` without server.ts) — HTTP polling keeps working as fallback
 *
 * @returns true when the socket is connected (live updates flowing)
 */
export function usePriceStream(
  favorites: { ticker: string }[],
  onUpdates: (updates: PriceUpdate[]) => void
): boolean {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<any>(null);
  const onUpdatesRef = useRef(onUpdates);
  onUpdatesRef.current = onUpdates;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { io } = await import('socket.io-client');
        if (cancelled) return;

        const socket = io({
          reconnectionAttempts: 5,
          timeout: 5000,
          transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', () => setConnected(false));

        socket.on('priceUpdate', (batch: { updates?: Array<unknown> }) => {
          const updates = (batch as { updates?: unknown[] })?.updates;
          if (Array.isArray(updates) && updates.length > 0) {
            onUpdatesRef.current(updates as never);
          }
        });
      } catch {
        // socket.io-client unavailable — polling fallback stays active
      }
    })();

    return () => {
      cancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, []);

  // Re-subscribe favorites whenever the ticker set changes
  const favoritesKey = favorites.map(f => f.ticker).join(',');
  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('subscribeFavorites', favoritesKey ? favoritesKey.split(',') : []);
  }, [favoritesKey]);

  return connected;
}
