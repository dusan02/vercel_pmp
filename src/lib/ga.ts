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
    __gaConfigured?: boolean;
    __gaBotBlocked?: boolean;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

/**
 * Detects automated headless scraping farms before sending GA4 telemetry:
 *  - navigator.webdriver === true
 *  - HeadlessChrome / PhantomJS / Puppeteer / Playwright UA
 *  - Synthetic 1:1 square screen resolution >= 800px (e.g. 1366x1366, 1600x1600)
 * Bypassed when `?debug` is present in the URL.
 */
export function isAutomatedBot(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.__gaBotBlocked) return true;
  if (new URLSearchParams(window.location.search).has('debug')) return false;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const sw = window.screen?.width ?? 0;
  const sh = window.screen?.height ?? 0;

  if (
    (typeof navigator !== 'undefined' && navigator.webdriver === true) ||
    /HeadlessChrome|PhantomJS|Puppeteer|Playwright/i.test(ua) ||
    (sw >= 800 && sw === sh)
  ) {
    window.__gaBotBlocked = true;
    if (GA_ID) {
      window[`ga-disable-${GA_ID}`] = true;
    }
    return true;
  }
  return false;
}

function ensureGtag(): ((...args: any[]) => void) | null {
  if (typeof window === 'undefined' || !GA_ID || isAutomatedBot()) {
    return null;
  }
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
  }
  if (!window.__gaConfigured) {
    const debugMode = new URLSearchParams(window.location.search).has('debug');
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      send_page_view: false,
      anonymize_ip: true,
      debug_mode: debugMode,
    });
    window.__gaConfigured = true;
  }
  return window.gtag;
}

/**
 * Track a page view
 * @param url - The URL path to track (e.g., '/heatmap' or '/heatmap?metric=mcap')
 */
export function pageview(url: string): void {
  const gtag = ensureGtag();
  if (!gtag) {
    return;
  }

  gtag('event', 'page_view', {
    page_path: url,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/**
 * Track a custom event
 * @param name - Event name (e.g., 'favorite_toggle', 'ticker_click')
 * @param params - Optional event parameters
 */
export function event(name: string, params?: Record<string, any>): void {
  const gtag = ensureGtag();
  if (!gtag) {
    return;
  }

  gtag('event', name, params);
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
  if (typeof window === 'undefined' || isAutomatedBot()) return () => {};
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

