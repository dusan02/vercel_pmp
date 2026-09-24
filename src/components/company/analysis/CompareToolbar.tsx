import React from 'react';

interface CompareToolbarProps {
    ticker: string;
    compareWith: string;
    compareInput: string;
    loadingCompare: boolean;
    peers?: string[] | undefined;
    onCompareInput: (val: string) => void;
    onAddComparison: (p?: string) => void;
    onRemoveComparison: () => void;
}

interface CompareToolbarProps {
    ticker: string;
    compareWith: string;
    compareInput: string;
    loadingCompare: boolean;
    compareError?: string | null;
    peers?: string[] | undefined;
    onCompareInput: (val: string) => void;
    onAddComparison: (p?: string) => void;
    onRemoveComparison: () => void;
}

export function CompareToolbar({
    ticker,
    compareWith,
    compareInput,
    loadingCompare,
    compareError,
    peers,
    onCompareInput,
    onAddComparison,
    onRemoveComparison
}: CompareToolbarProps) {
    const isSelf = compareInput.toUpperCase().trim() === ticker.toUpperCase();
    return (
        <div data-html2canvas-ignore="true" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {compareWith ? `Comparing: ${ticker} vs ${compareWith}` : 'Compare with a competitor'}
                    </span>
                    {compareWith && (
                        <button onClick={onRemoveComparison} disabled={loadingCompare} aria-label="Remove comparison" className="ml-auto md:ml-4 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                            ✕ Remove
                        </button>
                    )}
                    {compareError && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">{compareError}</span>
                    )}
                </div>
                {!compareWith && (
                    <div className="flex-1">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                aria-label="Enter ticker to compare"
                                placeholder="Enter ticker (e.g. MSFT)"
                                value={compareInput}
                                disabled={loadingCompare}
                                onChange={(e) => onCompareInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !loadingCompare && !isSelf) { e.preventDefault(); onAddComparison(); } }}
                                className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <button
                                onClick={() => onAddComparison()}
                                disabled={!compareInput || loadingCompare || isSelf}
                                aria-label="Add comparison"
                                aria-busy={loadingCompare}
                                title={isSelf ? 'Cannot compare a ticker with itself' : undefined}
                                className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 min-w-[60px] focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                            >
                                {loadingCompare ? '...' : 'Add'}
                            </button>
                        </div>
                        {isSelf && compareInput && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">Cannot compare a ticker with itself.</p>
                        )}
                        {peers && peers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="text-xs text-gray-400">Sector peers:</span>
                                {peers.map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => onAddComparison(p)}
                                        disabled={loadingCompare}
                                        className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 hover:text-blue-700 dark:hover:text-blue-400 px-2 py-1 rounded font-mono transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
