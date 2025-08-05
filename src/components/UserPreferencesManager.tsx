'use client';

import { useState } from 'react';
import { useUserPreferences, UserPreferences } from '@/hooks/useUserPreferences';

interface UserPreferencesManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserPreferencesManager({ isOpen, onClose }: UserPreferencesManagerProps) {
  const { preferences, savePreferences, clearPreferences, hasConsent } = useUserPreferences();
  const [localPrefs, setLocalPrefs] = useState<UserPreferences>(preferences);

  if (!isOpen) return null;

  const handleSave = () => {
    savePreferences(localPrefs);
    onClose();
  };

  const handleReset = () => {
    setLocalPrefs(preferences);
  };

  const handleClearAll = () => {
    if (confirm('Naozaj chcete vymazať všetky vaše nastavenia?')) {
      clearPreferences();
      onClose();
    }
  };

  if (!hasConsent) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h2 className="text-lg font-semibold mb-4">Nastavenia</h2>
          <p className="text-gray-600 mb-4">
            Pre uloženie nastavení musíte najprv prijať cookies.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Zavrieť
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Nastavenia</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Theme Settings */}
          <div>
            <h3 className="text-lg font-medium mb-3">Vzhľad</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="theme"
                  value="light"
                  checked={localPrefs.theme === 'light'}
                  onChange={(e) => setLocalPrefs(prev => ({ ...prev, theme: e.target.value as 'light' }))}
                  className="mr-2"
                />
                Svetlá téma
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="theme"
                  value="dark"
                  checked={localPrefs.theme === 'dark'}
                  onChange={(e) => setLocalPrefs(prev => ({ ...prev, theme: e.target.value as 'dark' }))}
                  className="mr-2"
                />
                Tmavá téma
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="theme"
                  value="auto"
                  checked={localPrefs.theme === 'auto'}
                  onChange={(e) => setLocalPrefs(prev => ({ ...prev, theme: e.target.value as 'auto' }))}
                  className="mr-2"
                />
                Automaticky (podľa systému)
              </label>
            </div>
          </div>

          {/* Default Tab */}
          <div>
            <h3 className="text-lg font-medium mb-3">Predvolená záložka</h3>
            <select
              value={localPrefs.defaultTab}
              onChange={(e) => setLocalPrefs(prev => ({ ...prev, defaultTab: e.target.value as any }))}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="all">Všetky akcie</option>
              <option value="favorites">Obľúbené</option>
              <option value="gainers">Najlepšie</option>
              <option value="losers">Najhoršie</option>
            </select>
          </div>

          {/* Auto Refresh */}
          <div>
            <h3 className="text-lg font-medium mb-3">Automatické obnovovanie</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={localPrefs.autoRefresh}
                  onChange={(e) => setLocalPrefs(prev => ({ ...prev, autoRefresh: e.target.checked }))}
                  className="mr-2"
                />
                Povoliť automatické obnovovanie
              </label>
              {localPrefs.autoRefresh && (
                <div className="ml-6">
                  <label className="block text-sm text-gray-600 mb-1">
                    Interval (sekundy):
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={localPrefs.refreshInterval}
                    onChange={(e) => setLocalPrefs(prev => ({ ...prev, refreshInterval: parseInt(e.target.value) }))}
                    className="w-24 p-1 border border-gray-300 rounded"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Display Options */}
          <div>
            <h3 className="text-lg font-medium mb-3">Zobrazenie</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={localPrefs.showEarnings}
                  onChange={(e) => setLocalPrefs(prev => ({ ...prev, showEarnings: e.target.checked }))}
                  className="mr-2"
                />
                Zobraziť earnings kalendár
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={localPrefs.showNews}
                  onChange={(e) => setLocalPrefs(prev => ({ ...prev, showNews: e.target.checked }))}
                  className="mr-2"
                />
                Zobraziť novinky
              </label>
            </div>
          </div>

          {/* Favorites Count */}
          <div>
            <h3 className="text-lg font-medium mb-3">Obľúbené akcie</h3>
            <p className="text-gray-600">
              Máte {preferences.favorites.length} obľúbených akcií
            </p>
            {preferences.favorites.length > 0 && (
              <div className="mt-2 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600 mb-2">Obľúbené:</p>
                <div className="flex flex-wrap gap-1">
                  {preferences.favorites.map(symbol => (
                    <span key={symbol} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                      {symbol}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between mt-6 pt-4 border-t">
          <button
            onClick={handleClearAll}
            className="px-4 py-2 text-red-600 hover:text-red-800"
          >
            Vymazať všetky nastavenia
          </button>
          <div className="space-x-2">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Resetovať
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Uložiť
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 