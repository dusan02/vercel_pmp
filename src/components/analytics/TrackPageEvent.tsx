'use client';

import { useEffect } from 'react';
import { event } from '@/lib/ga';

/**
 * Fires a GA4 event once on mount — used by server-component pages that
 * can't call gtag directly (e.g. view_item on /analysis/[ticker]).
 */
export function TrackPageEvent({ name, params }: { name: string; params?: Record<string, any> }) {
    useEffect(() => {
        event(name, params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}
