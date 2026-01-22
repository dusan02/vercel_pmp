'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { PieChart, Star, Calendar, Globe } from 'lucide-react';
import { SectionIcon } from '@/components/SectionIcon';

export type MobileTab = 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

interface TabItem {
  id: MobileTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  ariaDescription?: string;
}

const HeatmapTabIcon: React.FC<{ size?: number; className?: string }> = ({ size = 22, className }) => (
  <SectionIcon type="heatmap" size={size} className={className || ''} />
);

const tabs: TabItem[] = [
  { 
    id: 'heatmap', 
    label: 'Heatmap', 
    icon: HeatmapTabIcon,
    ariaDescription: 'View market heatmap by sectors'
  },
  { 
    id: 'portfolio', 
    label: 'Portfolio', 
    icon: PieChart,
    ariaDescription: 'View and manage your portfolio'
  },
  { 
    id: 'favorites', 
    label: 'Favorites', 
    icon: Star,
    ariaDescription: 'View your favorite stocks'
  },
  { 
    id: 'earnings', 
    label: 'Earnings', 
    icon: Calendar,
    ariaDescription: 'View today\'s earnings calendar'
  },
  { 
    id: 'allStocks', 
    label: 'Stocks', 
    icon: Globe,
    ariaDescription: 'Browse all available stocks'
  },
];

/**
 * MobileTabBar - Moderná bottom navigation
 * Minimalistický dizajn s smooth transitions
 * 
 * Vylepšenia:
 * - Keyboard navigation (Arrow keys, Home, End)
 * - Lepšie ARIA labels a descriptions
 * - Touch feedback optimization
 * - Prevent double-tap zoom
 */
export function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  const tabRefs = useRef<Map<MobileTab, HTMLButtonElement>>(new Map());
  const navRef = useRef<HTMLElement>(null);

  // Measure real tabbar height (including safe-area) and set CSS variable
  const lastHRef = useRef<number>(-1);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const updateTabbarHeight = () => {
      const h = Math.floor(el.getBoundingClientRect().height);
      // Only update if height actually changed (prevents 1px bounce repaints)
      if (h > 0 && h !== lastHRef.current) {
        lastHRef.current = h;
        // Set real measured height (includes safe-area from padding-bottom)
        document.documentElement.style.setProperty('--tabbar-real-h', `${h}px`);
      }
    };

    // Initial measurement
    updateTabbarHeight();

    // ResizeObserver catches: safe-area padding changes, font/zoom, layout changes on orientation
    // orientationchange is kept as explicit fallback for orientation changes
    const ro = new ResizeObserver(updateTabbarHeight);
    ro.observe(el);
    // Note: window.resize removed - ResizeObserver already handles resize events
    window.addEventListener('orientationchange', updateTabbarHeight);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', updateTabbarHeight);
    };
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, tabId: MobileTab) => {
    const currentIndex = tabs.findIndex(t => t.id === tabId);
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    const nextTab = tabs[nextIndex];
    if (nextTab) {
      onTabChange(nextTab.id);
      // Focus next tab after state update
      setTimeout(() => {
        tabRefs.current.get(nextTab.id)?.focus();
      }, 0);
    }
  }, [onTabChange]);

  // Set refs for keyboard navigation
  const setTabRef = useCallback((tabId: MobileTab, el: HTMLButtonElement | null) => {
    if (el) {
      tabRefs.current.set(tabId, el);
    } else {
      tabRefs.current.delete(tabId);
    }
  }, []);

  // Focus management: when activeTab changes, focus the active tab (for screen readers)
  useEffect(() => {
    const activeTabEl = tabRefs.current.get(activeTab);
    if (activeTabEl && document.activeElement !== activeTabEl) {
      // Only focus if user is navigating with keyboard
      const isKeyboardNavigation = document.activeElement?.tagName === 'BUTTON' || 
                                   document.activeElement === navRef.current;
      if (isKeyboardNavigation) {
        activeTabEl.focus();
      }
    }
  }, [activeTab]);

  return (
    <nav 
      ref={navRef}
      className="mobile-app-tabbar" 
      role="tablist" 
      aria-label="Main navigation"
      aria-orientation="horizontal"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            ref={(el) => setTabRef(tab.id, el)}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            className={`mobile-app-tab ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            aria-describedby={tab.ariaDescription ? `tab-desc-${tab.id}` : undefined}
            tabIndex={isActive ? 0 : -1}
            style={{ 
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation' // Prevent double-tap zoom
            }}
          >
            <div className="mobile-app-tab-icon" aria-hidden="true">
              <Icon size={22} />
            </div>
            <span className="mobile-app-tab-label">{tab.label}</span>
            {tab.ariaDescription && (
              <span id={`tab-desc-${tab.id}`} className="sr-only">
                {tab.ariaDescription}
              </span>
            )}
            {isActive && (
              <div 
                className="mobile-app-tab-indicator" 
                aria-hidden="true"
                aria-label="Active tab indicator"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
