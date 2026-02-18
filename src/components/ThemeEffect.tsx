'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useUserPreferences } from '@/hooks/useUserPreferences';

/**
 * ThemeEffect - One-time sync bridge.
 * 
 * On mount: reads the user's stored theme preference from localStorage
 * and pushes it into next-themes. After that, next-themes owns the state.
 * Also syncs back: when next-themes changes, update useUserPreferences.
 */
export function ThemeEffect() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const { preferences, isLoaded, savePreferences } = useUserPreferences();
    const hasSynced = useRef(false);

    // On first load: push stored preference into next-themes (one-time)
    useEffect(() => {
        if (!isLoaded || hasSynced.current) return;
        hasSynced.current = true;

        const stored = preferences.theme;
        if (stored === 'dark' || stored === 'light') {
            setTheme(stored);
        }
        // 'auto' → let next-themes handle via enableSystem
    }, [isLoaded, preferences.theme, setTheme]);

    // Sync back: when next-themes resolvedTheme changes, save to preferences
    useEffect(() => {
        if (!isLoaded || !resolvedTheme) return;
        // Only save light/dark, not 'system'
        if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
            if (preferences.theme !== resolvedTheme) {
                savePreferences({ theme: resolvedTheme });
            }
        }
    }, [resolvedTheme, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

    return null;
}
