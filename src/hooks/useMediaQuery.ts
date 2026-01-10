'use client';

import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
    // Initialize with correct value on client, false on server
    const [matches, setMatches] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        // Avoid running on server
        if (typeof window === 'undefined') return;

        const media = window.matchMedia(query);
        // Set initial value
        setMatches(media.matches);

        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);

        return () => media.removeEventListener('change', listener);
    }, [query]);

    return matches;
}
