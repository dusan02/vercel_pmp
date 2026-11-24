'use client';

import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
    // Start false on both SSR and initial hydration pass so server/client markup
    // matches (avoids React #418); useEffect syncs the live media state right after.
    const [matches, setMatches] = useState(false);

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
