
'use client';

import { SessionProvider } from "next-auth/react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
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
