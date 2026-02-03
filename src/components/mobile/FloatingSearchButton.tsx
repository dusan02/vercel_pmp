'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface FloatingSearchButtonProps {
    onClick: () => void;
}

export function FloatingSearchButton({ onClick }: FloatingSearchButtonProps) {
    return (
        <button
            onClick={onClick}
            className="fixed z-[99] bottom-[calc(var(--tabbar-h,72px)+env(safe-area-inset-bottom,0px)+1rem)] right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-95 transition-transform duration-200 lg:hidden"
            aria-label="Search stocks"
            type="button"
        >
            <Search size={28} strokeWidth={2.5} />
        </button>
    );
}
