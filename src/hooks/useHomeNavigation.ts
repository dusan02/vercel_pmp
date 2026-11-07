'use client';

import { useState, useCallback, useEffect, startTransition } from 'react';
import { useRouter } from 'next/navigation';

export type ActiveSection =
  | 'heatmap'
  | 'analysis'
  | 'ideas'
  | 'movers'
  | 'portfolio'
  | 'favorites'
  | 'earnings'
  | 'screener'
  | 'blog'
  | 'pricing';

const VALID_SECTIONS: ActiveSection[] = [
  'heatmap', 'analysis', 'ideas', 'movers', 'portfolio', 'favorites',
  'earnings', 'screener', 'blog', 'pricing',
];

// Legacy 'allStocks' tab id → 'screener' (kept for old ?tab= URLs and events)
const normalizeTab = (tab: string): string => (tab === 'allStocks' ? 'screener' : tab);

// Sections backed by a standalone canonical page — middleware 301s ?tab=X
// to these anyway, so navigating there directly avoids the visible
// ?tab → standalone double hop.
const SECTION_ROUTES: Record<string, string> = {
  heatmap: '/heatmap',
  brief: '/brief',
  analysis: '/analysis',
  ideas: '/trading-ideas',
  movers: '/premarket-movers',
  portfolio: '/portfolio',
  favorites: '/favorites',
  earnings: '/earnings',
  screener: '/screener',
  blog: '/blog',
  pricing: '/pricing',
};

interface UseHomeNavigationOptions {
  isMounted: boolean;
}

export function useHomeNavigation({ isMounted }: UseHomeNavigationOptions) {
  const router = useRouter();
  // Avoid useSearchParams() here: calling it in HomePage triggers Next.js
  // BAILOUT_TO_CLIENT_SIDE_RENDERING on static/ISR `/`, which strips the
  // entire HomePage out of SSR HTML (and previously triggered React #412 when
  // Suspense was absent). Middleware already 301-redirects ?tab= URLs on the
  // server; client mount syncs any residual query params via window.location.
  const [activeSection, setActiveSection] = useState<ActiveSection>('heatmap');
  const [analysisTicker, setAnalysisTicker] = useState<string | null>(null);

  const setActiveTab = useCallback((tab: string): boolean => {
    const normalized = normalizeTab(tab);
    if (VALID_SECTIONS.includes(normalized as ActiveSection)) {
      setActiveSection(normalized as ActiveSection);
      return true;
    }
    return false;
  }, []);

  const parseUrlParams = useCallback(() => {
    if (typeof window === 'undefined') {
      return { tab: null, ticker: null };
    }
    const sp = new URLSearchParams(window.location.search);
    return {
      tab: sp.get('tab'),
      ticker: sp.get('ticker'),
    };
  }, []);

  // Sync on initial mount (preserve default 'heatmap' if no param)
  useEffect(() => {
    if (!isMounted) return;
    const { tab, ticker } = parseUrlParams();
    if (ticker) setAnalysisTicker(ticker.toUpperCase());
    if (tab) setActiveTab(tab);
  }, [isMounted, setActiveTab, parseUrlParams]);

  // Browser back/forward navigation
  useEffect(() => {
    if (!isMounted) return;
    const handlePopState = () => {
      const { tab, ticker } = parseUrlParams();
      if (ticker) setAnalysisTicker(ticker.toUpperCase());
      if (tab) setActiveTab(tab);
      else setActiveTab('heatmap');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMounted, parseUrlParams, setActiveTab]);

  // Custom events from other components (e.g. FavoritesSection → 'mobile-nav-change')
  useEffect(() => {
    if (!isMounted) return;
    const handleNavChange = (e: CustomEvent<string | { tab: string; ticker?: string }>) => {
      const detail = e.detail;
      const tab = typeof detail === 'string' ? detail : detail.tab;
      const ticker = typeof detail === 'object' ? detail.ticker : undefined;
      // Ticker clicks navigate to the canonical /analysis/[ticker] page —
      // matches the middleware 301 for /?tab=analysis&ticker=X.
      if (tab === 'analysis' && ticker) {
        router.push(`/analysis/${ticker.toUpperCase()}`);
        return;
      }
      const standalone = SECTION_ROUTES[normalizeTab(tab)];
      if (standalone) {
        router.push(standalone);
        return;
      }
      if (!setActiveTab(tab)) return;
      if (ticker) setAnalysisTicker(ticker.toUpperCase());
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      if (ticker && tab === 'analysis') url.searchParams.set('ticker', ticker.toUpperCase());
      else if (tab !== 'analysis') url.searchParams.delete('ticker');
      window.history.pushState({}, '', url.toString());
      // Keep-alive tab switches don't reset scroll — without this a click
      // near the bottom (e.g. "All movers" below the 600px heatmap) lands
      // on the footer of the newly revealed tab.
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('mobile-nav-change', handleNavChange as EventListener);
    return () => window.removeEventListener('mobile-nav-change', handleNavChange as EventListener);
  }, [isMounted, setActiveTab, router]);

  const handleMobileNavChange = useCallback((section: ActiveSection, ticker?: string) => {
    // Ticker clicks go straight to the canonical /analysis/[ticker] page —
    // shareable URL + real pageview (tab variant already 301s server-side).
    if (section === 'analysis' && ticker) {
      router.push(`/analysis/${ticker.toUpperCase()}`);
      return;
    }
    const standalone = SECTION_ROUTES[section];
    if (standalone) {
      router.push(standalone);
      return;
    }
    // startTransition keeps the UI responsive — first-activation mounts of
    // heavy tabs (heatmap, analysis) are non-blocking, input stays snappy.
    startTransition(() => {
      setActiveSection(section);
      if (section === 'analysis') setAnalysisTicker(null); // priamy klik na Analysis tab = prázdny search
    });
    const url = new URL(window.location.href);
    url.searchParams.set('tab', section);
    url.searchParams.delete('ticker');
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0 });
  }, [router]);

  return {
    activeSection,
    analysisTicker,
    setAnalysisTicker,
    handleMobileNavChange,
  };
}
