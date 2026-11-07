'use client';

import { useEffect, useState } from 'react';
import { useFavorites } from './useFavorites';
import type { FavoriteSignalItem } from '@/app/api/favorites/signals/route';

interface CachedSignals {
  key: string;
  ts: number;
  signals: FavoriteSignalItem[];
}

const TTL_MS = 60_000;
let memoryCache: CachedSignals | null = null;
let inflightKey: string | null = null;
let inflightPromise: Promise<FavoriteSignalItem[]> | null = null;

async function fetchSignalsForKey(key: string): Promise<FavoriteSignalItem[]> {
  if (!key) return [];
  const now = Date.now();
  if (memoryCache && memoryCache.key === key && now - memoryCache.ts < TTL_MS) {
    return memoryCache.signals;
  }
  if (inflightKey === key && inflightPromise) {
    return inflightPromise;
  }

  inflightKey = key;
  inflightPromise = fetch(`/api/favorites/signals?tickers=${encodeURIComponent(key)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      const list: FavoriteSignalItem[] = Array.isArray(json?.signals) ? json.signals : [];
      memoryCache = { key, ts: Date.now(), signals: list };
      return list;
    })
    .catch(() => [])
    .finally(() => {
      if (inflightKey === key) {
        inflightKey = null;
        inflightPromise = null;
      }
    });

  return inflightPromise;
}

export function useFavoriteSignals() {
  const { favoriteTickers } = useFavorites();
  const key = favoriteTickers
    .slice(0, 30)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(',');

  const [signals, setSignals] = useState<FavoriteSignalItem[]>(() => {
    if (memoryCache && memoryCache.key === key && Date.now() - memoryCache.ts < TTL_MS) {
      return memoryCache.signals;
    }
    return [];
  });

  useEffect(() => {
    if (!key) {
      setSignals([]);
      return;
    }
    let cancelled = false;
    fetchSignalsForKey(key).then((list) => {
      if (!cancelled) setSignals(list);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    signals,
    signalCount: signals.length,
  };
}
