'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
    className?: string;
}

/**
 * ThemeToggle - uses next-themes' useTheme() for reliable toggling.
 * Syncs with useUserPreferences for persistence across sessions.
 */
export function ThemeToggle({ className = '' }: ThemeToggleProps) {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => setMounted(true), []);

    // Prevent hydration mismatch - show placeholder until mounted
    if (!mounted) return <div className={`w-8 h-8 ${className}`} />;

    const isDark = resolvedTheme === 'dark';

    const toggleTheme = () => {
        const newTheme = isDark ? 'light' : 'dark';
        setTheme(newTheme);
    };

    return (
        <button
            onClick={toggleTheme}
            className={`relative inline-flex items-center justify-center p-2 rounded-lg transition-colors
                hover:bg-gray-200 dark:hover:bg-white/10
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                ${className}`}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
            <div className="relative w-5 h-5">
                {/* Sun Icon (visible in dark mode → click to switch to light) */}
                <Sun
                    className={`absolute inset-0 w-full h-full transition-all duration-300 transform
                        ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'}`}
                    strokeWidth={2}
                />
                {/* Moon Icon (visible in light mode → click to switch to dark) */}
                <Moon
                    className={`absolute inset-0 w-full h-full transition-all duration-300 transform
                        ${!isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`}
                    strokeWidth={2}
                />
            </div>
        </button>
    );
}
