'use client';

import { useState } from 'react';

interface CompanyDescriptionProps {
    text: string;
}

export function CompanyDescription({ text }: CompanyDescriptionProps) {
    const [expanded, setExpanded] = useState(false);
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const isLong = sentences.length > 5;
    const display = expanded ? text : sentences.slice(0, 5).join(' ').trim();

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-6">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Company Description
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {display}
            </p>
            {isLong && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-2 text-xs font-semibold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                    {expanded ? 'Show less ↑' : 'Read more ↓'}
                </button>
            )}
        </div>
    );
}
