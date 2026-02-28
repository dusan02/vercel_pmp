'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useUserPreferences, UserPreferences } from '@/hooks/useUserPreferences';

interface UserPreferencesManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserPreferencesManager({ isOpen, onClose }: UserPreferencesManagerProps) {
  const { preferences, savePreferences, clearPreferences, hasConsent } = useUserPreferences();
  const [localPrefs, setLocalPrefs] = useState<UserPreferences>(preferences);
  const { theme, setTheme } = useTheme();
  const [originalTheme, setOriginalTheme] = useState<string | undefined>(undefined);

  // Initialize original theme when modal opens
  useEffect(() => {
    if (isOpen && originalTheme === undefined) {
      setOriginalTheme(theme);
    }
  }, [isOpen, theme, originalTheme]);

  if (!isOpen) return null;

  const handleSave = () => {
    savePreferences(localPrefs);
    // Theme is already updated via preview, no need to reset
    onClose();
  };

  const handleReset = () => {
    setLocalPrefs(preferences);
    // Reset theme preview to stored preference
    if (preferences.theme) {
      setTheme(preferences.theme === 'auto' ? 'system' : preferences.theme);
    }
  };

  const handleClose = () => {
    // Revert theme if changed during preview
    if (originalTheme) {
      setTheme(originalTheme);
    }
    onClose();
  };

  const handleClearAll = () => {
    if (confirm('Naozaj chcete vymazať všetky vaše nastavenia?')) {
      clearPreferences();
      setTheme('system');
      onClose();
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
    setLocalPrefs(prev => ({ ...prev, theme: newTheme }));
    // Immediate preview
    setTheme(newTheme === 'auto' ? 'system' : newTheme);
  };

  if (!hasConsent) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Nastavenia</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            Pre uloženie nastavení musíte najprv prijať cookies.
          </p>
          <button
            onClick={handleClose}
            className="w-full px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Zavrieť
          </button>
        </div>
      </div>
    );
  }

  const ToggleRow = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (val: boolean) => void }) => (
    <label className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors">
      <span className="text-slate-700 dark:text-slate-200">{label}</span>
      <div className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
      </div>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700 flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Nastavenia aplikácie</h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Page Layout Sections */}
          <div>
            <h3 className="text-lg font-medium mb-3 text-slate-900 dark:text-white flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
              Viditeľnosť sekcií
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-2 space-y-1">
              <ToggleRow
                label="Market Heatmap"
                checked={localPrefs.showHeatmapSection ?? true}
                onChange={(val) => setLocalPrefs(prev => ({ ...prev, showHeatmapSection: val }))}
              />
              <ToggleRow
                label="Portfolio"
                checked={localPrefs.showPortfolioSection ?? true}
                onChange={(val) => setLocalPrefs(prev => ({ ...prev, showPortfolioSection: val }))}
              />
              <ToggleRow
                label="Obľúbené akcie (Favorites)"
                checked={localPrefs.showFavoritesSection ?? true}
                onChange={(val) => setLocalPrefs(prev => ({ ...prev, showFavoritesSection: val }))}
              />
              <ToggleRow
                label="Earnings Kalendár"
                checked={localPrefs.showEarningsSection ?? true}
                onChange={(val) => setLocalPrefs(prev => ({ ...prev, showEarningsSection: val }))}
              />
              <ToggleRow
                label="Všetky akcie (All Stocks)"
                checked={localPrefs.showAllStocksSection ?? true}
                onChange={(val) => setLocalPrefs(prev => ({ ...prev, showAllStocksSection: val }))}
              />
            </div>
          </div>

          {/* Theme Settings */}
          <div>
            <h3 className="text-lg font-medium mb-3 text-slate-900 dark:text-white flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>
              Vzhľad
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'light', label: 'Svetlá', icon: '☀️' },
                { value: 'dark', label: 'Tmavá', icon: '🌙' },
                { value: 'auto', label: 'Auto', icon: '⚙️' }
              ].map((themeOption) => (
                <label key={themeOption.value} className={`
                  flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer transition-all
                  ${localPrefs.theme === themeOption.value
                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-400 dark:text-blue-300 ring-1 ring-blue-500'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}
                `}>
                  <input
                    type="radio"
                    name="theme"
                    value={themeOption.value}
                    checked={localPrefs.theme === themeOption.value}
                    onChange={() => handleThemeChange(themeOption.value as any)}
                    className="sr-only"
                  />
                  <span className="text-xl mb-1">{themeOption.icon}</span>
                  <span className="text-sm font-medium">{themeOption.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center sticky bottom-0 rounded-b-xl">
          <button
            onClick={handleClearAll}
            className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 underline underline-offset-4"
          >
            Resetovať všetko
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors"
            >
              Zrušiť
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-500/20 transition-colors"
            >
              Uložiť zmeny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
