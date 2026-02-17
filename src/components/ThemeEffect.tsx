'use client';

import { useEffect } from 'react';
import { useUserPreferences } from '@/hooks/useUserPreferences';

/**
 * ThemeEffect component
 * 
 * Applies the 'dark' class to the document based on user preferences.
 * This component renders nothing but handles the side effect of theme switching.
 */
export function ThemeEffect() {
    const { preferences, isLoaded } = useUserPreferences();

    useEffect(() => {
        // Wait for preferences to load to avoid flickering (though default is now light)
        if (!isLoaded) return;

        const root = document.documentElement;
        const theme = preferences.theme;

        if (theme === 'dark') {
            root.classList.add('dark');
        } else if (theme === 'light') {
            root.classList.remove('dark');
        } else if (theme === 'auto') {
            // Auto mode: check system preference
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (systemDark) {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        }
    }, [preferences.theme, isLoaded]);

    return null;
}
