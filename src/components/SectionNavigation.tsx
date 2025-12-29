'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserPreferences } from '@/hooks/useUserPreferences';
import { SectionIcon } from './SectionIcon';

interface SectionNavigationProps {
  preferences: UserPreferences;
  onToggleSection: (sectionKey: keyof UserPreferences) => void;
  onScrollToSection: (sectionId: string) => void;
}

interface SectionConfig {
  key: keyof UserPreferences;
  label: string;
  icon: 'heatmap' | 'pie' | 'star' | 'calendar' | 'globe';
  sectionId: string;
}

const sections: SectionConfig[] = [
  { key: 'showHeatmapSection', label: 'Heatmap', icon: 'heatmap', sectionId: 'section-heatmap' },
  { key: 'showPortfolioSection', label: 'Portfolio', icon: 'pie', sectionId: 'section-portfolio' },
  { key: 'showFavoritesSection', label: 'Favorites', icon: 'star', sectionId: 'section-favorites' },
  { key: 'showEarningsSection', label: 'Earnings', icon: 'calendar', sectionId: 'section-earnings' },
  { key: 'showAllStocksSection', label: 'All Stocks', icon: 'globe', sectionId: 'section-all-stocks' },
];

export function SectionNavigation({ preferences, onToggleSection, onScrollToSection }: SectionNavigationProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [mounted, setMounted] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    // Component mounted successfully
  }, []);

  // Detect active section using Intersection Observer
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (isScrolling) return; // Don't update during programmatic scroll

        // Find the section with the highest intersection ratio
        const visibleSections = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visibleSections.length > 0) {
          const topSection = visibleSections[0];
          if (topSection && topSection.target?.id) {
            setActiveSection(topSection.target.id);
          }
        }
      },
      {
        rootMargin: '-20% 0px -60% 0px', // Trigger when section is in upper 20% of viewport
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    // Observe all sections
    sections.forEach((section) => {
      const element = document.getElementById(section.sectionId);
      if (element) {
        observerRef.current?.observe(element);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isScrolling, preferences]);

  // Handle scroll end
  useEffect(() => {
    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleSectionClick = useCallback(
    (section: SectionConfig) => {
      const isVisible = preferences[section.key] ?? true;

      // If section is hidden, show it first
      if (!isVisible) {
        onToggleSection(section.key);
        // Wait for section to render, then scroll
        setTimeout(() => {
          onScrollToSection(section.sectionId);
          setIsScrolling(true);
        }, 100);
      } else {
        // Section is visible, just scroll to it
        onScrollToSection(section.sectionId);
        setIsScrolling(true);
      }
    },
    [preferences, onToggleSection, onScrollToSection]
  );

  const handleToggleClick = useCallback(
    (e: React.MouseEvent, section: SectionConfig) => {
      e.stopPropagation();
      onToggleSection(section.key);
    },
    [onToggleSection]
  );

  if (!mounted) {
    return null;
  }

  return (
    <nav
      className="z-40"
      aria-label="Section navigation"
    >
      <div className="bg-transparent p-0">
        {/* Desktop: Horizontal layout */}
        <div className="hidden lg:flex flex-row gap-0.5 header-nav-container">
          {sections.map((section) => {
            const isVisible = preferences[section.key] ?? true;
            const isActive = activeSection === section.sectionId;

            return (
              <div
                key={section.key}
                className={`
                  group nav-item relative flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all cursor-pointer flex-shrink-0
                  ${isActive 
                    ? 'active' 
                    : ''
                  }
                `}
                onClick={() => handleSectionClick(section)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSectionClick(section);
                  }
                }}
                aria-label={`Navigate to ${section.label} section`}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  <SectionIcon type={section.icon} size={18} />
                </div>

                {/* Label */}
                <span className="flex-1">
                  {section.label}
                </span>

                {/* Toggle button */}
                <button
                  onClick={(e) => handleToggleClick(e, section)}
                  className={`
                    flex-shrink-0 p-1 rounded transition-all opacity-0 group-hover:opacity-100
                    focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                    ${isVisible
                      ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                      : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }
                  `}
                  aria-label={`${isVisible ? 'Hide' : 'Show'} ${section.label} section`}
                  title={`${isVisible ? 'Hide' : 'Show'} ${section.label}`}
                >
                  {isVisible ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M12 5v14" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Mobile: Grid layout (2 columns) */}
        <div className="lg:hidden flex flex-wrap gap-0.5 mobile-nav-container">
          {sections.map((section) => {
            const isVisible = preferences[section.key] ?? true;
            const isActive = activeSection === section.sectionId;

            return (
              <div
                key={section.key}
                className={`
                  nav-item relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg transition-all cursor-pointer
                  flex-1 min-w-[calc(50%-0.25rem)]
                  ${isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  }
                `}
                onClick={() => handleSectionClick(section)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSectionClick(section);
                  }
                }}
                aria-label={`Navigate to ${section.label} section`}
              >
                {/* Icon only - no text on mobile */}
                <div className="flex-shrink-0">
                  <SectionIcon type={section.icon} size={24} />
                </div>

                {/* Visibility indicator (mobile) */}
                {!isVisible && (
                  <span className="absolute top-1 right-1 text-xs opacity-60">●</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

