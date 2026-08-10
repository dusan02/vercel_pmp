'use client';

interface AnalysisControlsBarProps {
    updatedAt: string | null;
    analyzing: boolean;
    onRefresh: () => void;
}

export function AnalysisControlsBar({ updatedAt, analyzing, onRefresh }: AnalysisControlsBarProps) {
    return (
        <div
            data-html2canvas-ignore="true"
            className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700/50"
        >
            <span className="text-xs text-gray-500 dark:text-gray-400">
                {updatedAt && (
                    <>Last updated: {new Date(updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</>
                )}
            </span>
            <button
                onClick={onRefresh}
                disabled={analyzing}
                className="text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-1.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {analyzing ? 'Updating...' : 'Refresh Analysis'}
            </button>
        </div>
    );
}
