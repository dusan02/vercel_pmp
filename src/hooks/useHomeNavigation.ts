'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export type ActiveSection =
  | 'heatmap'
  | 'analysis'
  | 'movers'
  | 'portfolio'
  | 'favorites'
  | 'earnings'
  | 'screener'
  | 'blog'
  | 'pricing';

const VALID_SECTIONS: ActiveSection[] = [
  'heatmap', 'analysis', 'movers', 'portfolio', 'favorites',
  'earnings', 'screener', 'blog', 'pricing',
];

// Legacy 'allStocks' tab id → 'screener' (kept for old ?tab= URLs and events)
const normalizeTab = (tab: string): string => (tab === 'allStocks' ? 'screener' : tab);

interface UseHomeNavigationOptions {
  isMounted: boolean;
}

export function useHomeNavigation({ isMounted }: UseHomeNavigationOptions) {
  const searchParams = useSearchParams();
  // Initialize from ?tab= synchronously — makes SSR render the correct section
  // (previously activeSection was always 'heatmap' on the server, so tabbed
  // content like earnings was never in SSR HTML)
  const [activeSection, setActiveSection] = useState<ActiveSection>(() => {
    const tab = searchParams.get('tab');
    const normalized = tab ? normalizeTab(tab) : 'heatmap';
    return VALID_SECTIONS.includes(normalized as ActiveSection)
      ? (normalized as ActiveSection)
      : 'heatmap';
  });
  const [analysisTicker, setAnalysisTicker] = useState<string | null>(() => {
    const t = searchParams.get('ticker');
    return t ? t.toUpperCase() : null;
  });

  const setActiveTab = useCallback((tab: string): boolean => {
    const normalized = normalizeTab(tab);
    if (VALID_SECTIONS.includes(normalized as ActiveSection)) {
      setActiveSection(normalized as ActiveSection);
      return true;
    }
    return false;
  }, []);

  const parseUrlParams = useCallback(() => {
    return {
      tab: searchParams.get('tab'),
      ticker: searchParams.get('ticker'),
    };
  }, [searchParams]);

  // Sync on initial mount (no fallback — preserve current tab if no param)
  useEffect(() => {
    if (!isMounted) return;
    const { tab, ticker } = parseUrlParams();
    if (ticker) setAnalysisTicker(ticker.toUpperCase());
    if (tab) setActiveTab(tab);
  }, [isMounted, setActiveTab, parseUrlParams]);

  // Sync on searchParams change (with fallback to heatmap)
  useEffect(() => {
    if (!isMounted) return;
    const { tab, ticker } = parseUrlParams();
    if (ticker) setAnalysisTicker(ticker.toUpperCase());
    if (tab) setActiveTab(tab);
    else setActiveTab('heatmap');
  }, [isMounted, parseUrlParams]);

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
      if (!setActiveTab(tab)) return;
      if (ticker) setAnalysisTicker(ticker.toUpperCase());
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      if (ticker && tab === 'analysis') url.searchParams.set('ticker', ticker.toUpperCase());
      else if (tab !== 'analysis') url.searchParams.delete('ticker');
      window.history.pushState({}, '', url.toString());
    };
    window.addEventListener('mobile-nav-change', handleNavChange as EventListener);
    return () => window.removeEventListener('mobile-nav-change', handleNavChange as EventListener);
  }, [isMounted, setActiveTab]);

  const handleMobileNavChange = useCallback((section: ActiveSection, ticker?: string) => {
    setActiveSection(section);
    if (ticker) setAnalysisTicker(ticker.toUpperCase());
    else if (section === 'analysis') setAnalysisTicker(null); // priamy klik na Analysis tab = prázdny search
    const url = new URL(window.location.href);
    url.searchParams.set('tab', section);
    if (ticker && section === 'analysis') url.searchParams.set('ticker', ticker.toUpperCase());
    else if (section !== 'analysis') url.searchParams.delete('ticker');
    else url.searchParams.delete('ticker'); // analysis bez tickeru = žiadny ticker param
    window.history.pushState({}, '', url.toString());
  }, []);

  return {
    activeSection,
    analysisTicker,
    setAnalysisTicker,
    handleMobileNavChange,
  };
}
