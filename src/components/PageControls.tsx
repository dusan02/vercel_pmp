'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { UserPreferences } from '@/hooks/useUserPreferences';
import { SectionIcon } from './SectionIcon';
import { getSegmentedButtonClasses } from '@/lib/utils/buttonStyles';

interface PageControlsProps {
  preferences: UserPreferences;
  onToggleSection: (sectionKey: keyof UserPreferences) => void;
  onThemeChange: (newTheme: 'light' | 'dark') => void;
}

export function PageControls({ preferences, onToggleSection, onThemeChange }: PageControlsProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleThemeToggle = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    onThemeChange(newTheme);
  };

  const sections = [
    { key: 'showHeatmapSection', label: 'Heatmap', icon: 'heatmap' },
    { key: 'showPortfolioSection', label: 'Portfolio', icon: 'pie' },
    { key: 'showFavoritesSection', label: 'Favorites', icon: 'star' },
    { key: 'showEarningsSection', label: 'Earnings', icon: 'calendar' },
    { key: 'showAllStocksSection', label: 'All Stocks', icon: 'globe' },
  ] as const;

  return (
    <div className="container mx-auto px-4 pb-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-800/50 p-3 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 backdrop-blur-sm">
        {/* Section Toggles */}
        <div className="flex flex-wrap justify-center sm:justify-start gap-2 w-full sm:w-auto">
          {sections.map((section) => {
            const isVisible = preferences[section.key] ?? true;
            return (
              <button
                key={section.key}
                onClick={() => onToggleSection(section.key)}
                className={getSegmentedButtonClasses(isVisible)}
                aria-label={`Toggle ${section.label} section`}
              >
                <div className="flex items-center gap-2">
                  <SectionIcon type={section.icon as any} size={16} />
                  <span>{section.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Dark Mode Toggle */}
        <button
          onClick={handleThemeToggle}
          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-yellow-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-slate-200 dark:border-slate-600"
          aria-label="Toggle Dark Mode"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          )}
        </button>
      </div>
    </div>
  );
}
