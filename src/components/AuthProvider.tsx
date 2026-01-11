
'use client';

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    // Suppress console errors for Auth.js fetch errors
    useEffect(() => {
        const originalError = console.error;
        console.error = (...args: any[]) => {
            // Filter out Auth.js JSON parsing errors
            const message = args[0]?.toString() || '';
            if (
                message.includes('Unexpected token') ||
                message.includes('is not valid JSON') ||
                message.includes('ClientFetchError') ||
                message.includes('authjs.dev')
            ) {
                // Silently ignore Auth.js parsing errors
                return;
            }
            originalError.apply(console, args);
        };

        return () => {
            console.error = originalError;
        };
    }, []);

    return (
        <SessionProvider
            // Reduce unnecessary refetches to minimize network errors
            refetchOnWindowFocus={false}
            // Suppress error logging for network issues (they're handled internally)
            basePath="/api/auth"
        >
            {children}
        </SessionProvider>
    );
}
