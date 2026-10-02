'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export interface SavedScreen {
    id: string;
    name: string;
    params: string; // /screener query string — restored via restoreFromParams
    createdAt: string;
}

export const MAX_SAVED_SCREENS = 3;

/**
 * Saved screener filter sets for authenticated users (max 3, enforced
 * server-side in /api/user/screens). Anonymous users get an empty list and
 * the UI hides the controls entirely.
 */
export function useSavedScreens() {
    const { data: session, status } = useSession();
    const [screens, setScreens] = useState<SavedScreen[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!session?.user?.id) return;
        try {
            const res = await fetch('/api/user/screens');
            if (res.ok) setScreens(await res.json());
        } catch {
            // non-fatal — saved screens are a convenience, not critical path
        }
    }, [session?.user?.id]);

    useEffect(() => {
        if (status === 'authenticated') refresh();
        if (status === 'unauthenticated') setScreens([]);
    }, [status, refresh]);

    const saveScreen = useCallback(async (name: string, params: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/user/screens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, params }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? 'Failed to save');
                return false;
            }
            const created = await res.json();
            setScreens((prev) => [...prev, created]);
            return true;
        } catch {
            setError('Failed to save');
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteScreen = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/user/screens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (res.ok) setScreens((prev) => prev.filter((s) => s.id !== id));
        } catch {
            // non-fatal
        }
    }, []);

    return {
        isAuthenticated: status === 'authenticated',
        screens, loading, error,
        canSave: screens.length < MAX_SAVED_SCREENS,
        saveScreen, deleteScreen, refresh,
    };
}
