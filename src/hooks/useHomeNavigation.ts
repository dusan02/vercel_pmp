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
  | 'allStocks'
  | 'screener'
  | 'blog';

const VALID_SECTIONS: ActiveSection[] = [
  'heatmap', 'analysis', 'movers', 'portfolio', 'favorites',
  'earnings', 'allStocks', 'screener', 'blog',
];

interface UseHomeNavigationOptions {
  isMounted: boolean;
}

export function useHomeNavigation({ isMounted }: UseHomeNavigationOptions) {
  const [activeSection, setActiveSection] = useState<ActiveSection>('heatmap');
  const [analysisTicker, setAnalysisTicker] = useState<string>('NVDA');
  const searchParams = useSearchParams();

  const setActiveTab = useCallback((tab: string): boolean => {
    if (VALID_SECTIONS.includes(tab as ActiveSection)) {
      setActiveSection(tab as ActiveSection);
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
    const url = new URL(window.location.href);
    url.searchParams.set('tab', section);
    if (ticker && section === 'analysis') url.searchParams.set('ticker', ticker.toUpperCase());
    else if (section !== 'analysis') url.searchParams.delete('ticker');
    window.history.pushState({}, '', url.toString());
  }, []);

  return {
    activeSection,
    analysisTicker,
    setAnalysisTicker,
    handleMobileNavChange,
  };
}
