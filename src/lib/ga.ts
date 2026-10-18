/**
 * Google Analytics 4 (GA4) tracking utilities
 * 
 * This module provides functions for tracking page views and custom events
 * in a Next.js App Router SPA environment.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || '';

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

/**
 * Track a page view
 * @param url - The URL path to track (e.g., '/heatmap' or '/heatmap?metric=mcap')
 */
export function pageview(url: string): void {
  if (typeof window === 'undefined' || !window.gtag) {
    return;
  }

  window.gtag('config', GA_ID, {
    page_path: url,
  });
}

/**
 * Track a custom event
 * @param name - Event name (e.g., 'favorite_toggle', 'ticker_click')
 * @param params - Optional event parameters
 */
export function event(name: string, params?: Record<string, any>): void {
  if (typeof window === 'undefined' || !window.gtag) {
    return;
  }

  window.gtag('event', name, params);
}

/**
 * Humanness signal — passive bot-vs-human evidence sent once per page view.
 * Render-farms run real headless browsers, so UA/rendered checks pass for
 * them; what they lack is navigator.webdriver=false + real input entropy
 * (mouse move, scroll, key/touch). Params use the hs_* prefix — GA4 custom
 * dims registered separately (never use reserved names like source/medium).
 *
 * Returns a cleanup — on route change it flushes the event early so short
 * dwells (≥3s) still count.
 */
export function initHumanSignal(): () => void {
  if (typeof window === 'undefined') return () => {};
  const t0 = Date.now();
  const st = { mouse: false, scroll: false, input: 'none', sent: false };

  const onMouse = () => { st.mouse = true; if (st.input === 'none') st.input = 'mouse'; };
  const onTouch = () => { st.mouse = true; st.input = 'touch'; };
  const onKey = () => { if (st.input === 'none') st.input = 'key'; };
  const onScroll = () => { st.scroll = true; };

  const send = () => {
    if (st.sent) return;
    st.sent = true;
    event('human_signal', {
      hs_webdriver: navigator.webdriver ? 1 : 0,
      hs_mouse: st.mouse ? 1 : 0,
      hs_scroll: st.scroll ? 1 : 0,
      hs_input: st.input,
      hs_dwell: Math.round((Date.now() - t0) / 1000),
    });
  };

  window.addEventListener('pointermove', onMouse, { once: true, passive: true });
  window.addEventListener('pointerdown', onMouse, { once: true, passive: true });
  window.addEventListener('touchstart', onTouch, { once: true, passive: true });
  window.addEventListener('keydown', onKey, { once: true, passive: true });
  window.addEventListener('scroll', onScroll, { once: true, passive: true });
  const timer = setTimeout(send, 15_000);

  return () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', onMouse);
    window.removeEventListener('pointerdown', onMouse);
    window.removeEventListener('touchstart', onTouch);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', onScroll);
    if (Date.now() - t0 >= 3000) send();
  };
}

