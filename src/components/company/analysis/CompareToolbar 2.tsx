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

export function CompareToolbar({
    ticker,
    compareWith,
    compareInput,
    loadingCompare,
    peers,
    onCompareInput,
    onAddComparison,
    onRemoveComparison
}: CompareToolbarProps) {
    return (
        <div data-html2canvas-ignore="true" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {compareWith ? `Comparing: ${ticker} vs ${compareWith}` : 'Compare with a competitor'}
                    </span>
                    {compareWith && (
                        <button onClick={onRemoveComparison} className="ml-auto md:ml-4 text-xs text-gray-400 hover:text-red-500 transition-colors">
                            ✕ Remove
                        </button>
                    )}
                </div>
                {!compareWith && (
                    <div className="flex-1">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Enter ticker (e.g. MSFT)"
                                value={compareInput}
                                onChange={(e) => onCompareInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && onAddComparison()}
                                className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={() => onAddComparison()}
                                disabled={!compareInput || loadingCompare}
                                className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 min-w-[60px]"
                            >
                                {loadingCompare ? '...' : 'Add'}
                            </button>
                        </div>
                        {peers && peers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="text-xs text-gray-400">Sector peers:</span>
                                {peers.map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => onAddComparison(p)}
                                        className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 hover:text-blue-700 dark:hover:text-blue-400 px-2 py-1 rounded font-mono transition-colors"
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
