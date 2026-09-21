'use client';

import { useEffect } from 'react';
import { event } from '@/lib/ga';

/**
 * Detects push-notification returns (?src=alert | ?src=digest) and fires a
 * GA4 `push_return` event — the last leg of the funnel:
 * page → movers → analysis → subscribe → push → return visit.
 */
export function PushAttribution() {
    useEffect(() => {
        const src = new URLSearchParams(window.location.search).get('src');
        if (src === 'alert' || src === 'digest') {
            event('push_return', { source: src, path: window.location.pathname });
        }
    }, []);
    return null;
}
