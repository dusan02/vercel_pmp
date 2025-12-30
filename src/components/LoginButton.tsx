'use client';

import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { event } from '@/lib/ga';

export function LoginButton() {
    const { data: session } = useSession();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }

        if (isDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownOpen]);

    if (session) {
        const userInitial = session.user?.name?.charAt(0).toUpperCase() || session.user?.email?.charAt(0).toUpperCase() || 'U';
        const userName = session.user?.name || session.user?.email || 'User';

        return (
            <div className="relative" ref={dropdownRef}>
                {/* Sign Out Button - Simple and Clean */}
                <button
                    onClick={() => {
                        setIsDropdownOpen(false);
                        signOut({ callbackUrl: '/' });
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 shadow-sm"
                    aria-label="Sign out"
                >
                    <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                    </svg>
                    <span>Sign Out</span>
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 py-1 z-50 transition-all duration-200 ease-out">
                        {/* User Info */}
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {session.user?.name || 'User'}
                            </p>
                            {session.user?.email && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                    {session.user.email}
                                </p>
                            )}
                        </div>

                        {/* Sign Out Button */}
                        <div className="px-2 py-1">
                            <button
                                onClick={() => {
                                    setIsDropdownOpen(false);
                                    signOut({ callbackUrl: '/' });
                                }}
                                className="w-full px-3 py-2.5 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 shadow-sm"
                                aria-label="Sign out"
                            >
                                <svg
                                    className="w-4 h-4 flex-shrink-0"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                    />
                                </svg>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Sign In Button
    return (
        <button
            onClick={() => {
              event('sign_in_click', { provider: 'google' });
              signIn("google");
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-sm hover:shadow-md"
            aria-label="Sign in with Google"
        >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="white" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" />
            </svg>
            <span>Sign In</span>
        </button>
    );
}
