'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { useMemo } from 'react';

type NextWebVitalMetric = {
  id: string;
  name: string;
  label: string;
  value: number;
  startTime?: number;
  delta?: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigationType?: any;
};

function getOrCreateSessionId(): string {
  try {
    const key = 'pmp_rum_session_id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return 'unknown';
  }
}

function shouldSample(): boolean {
  try {
    const key = 'pmp_rum_sample_v1';
    const existing = localStorage.getItem(key);
    if (existing === '1') return true;
    if (existing === '0') return false;
    // Default: 10% sample (persisted)
    const sampled = Math.random() < 0.1;
    localStorage.setItem(key, sampled ? '1' : '0');
    return sampled;
  } catch {
    // If storage is blocked, do a tiny sample to avoid spamming.
    return Math.random() < 0.02;
  }
}

async function sendVitals(payload: unknown) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/performance', blob);
      return;
    }
    await fetch('/api/performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // ignore
  }
}

/**
 * WebVitalsReporter
 * Lightweight RUM for Core Web Vitals (INP/LCP/CLS/FCP/TTFB) via Next's `useReportWebVitals`.
 * Sends metrics to `/api/performance` using sendBeacon where possible.
 */
export function WebVitalsReporter() {
  const sampled = useMemo(() => shouldSample(), []);

  useReportWebVitals((metric: NextWebVitalMetric) => {
    if (!sampled) return;

    const sessionId = getOrCreateSessionId();

    void sendVitals({
      sessionId,
      metrics: [
        {
          id: metric.id,
          name: metric.name,
          label: metric.label,
          value: metric.value,
          startTime: metric.startTime,
          delta: metric.delta,
          rating: metric.rating,
          // The server will populate UA + referer; include path for convenience too.
          path: typeof location !== 'undefined' ? location.pathname : undefined,
        },
      ],
    });
  });

  return null;
}

