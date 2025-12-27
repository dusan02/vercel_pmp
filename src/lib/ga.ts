/**
 * Google Analytics 4 (GA4) tracking utilities
 * 
 * This module provides functions for tracking page views and custom events
 * in a Next.js App Router SPA environment.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-VQ1P6MDRRW';

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

