import React from 'react';

interface AnalysisControlsProps {
    updatedAt: string;
    analyzing: boolean;
    isExporting: boolean;
    handleDownloadPDF: () => void;
    runDeepAnalysis: () => void;
}

export function AnalysisControls({
    updatedAt,
    analyzing,
    isExporting,
    handleDownloadPDF,
    runDeepAnalysis
}: AnalysisControlsProps) {
    return (
        <div data-html2canvas-ignore="true" className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
            <span className="text-sm text-gray-500 dark:text-gray-400">
                Last updated: {new Date(updatedAt).toLocaleDateString()}
            </span>
            <div className="flex items-center gap-3">
                <button
                    onClick={handleDownloadPDF}
                    disabled={analyzing || isExporting}
                    className="text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 font-medium py-1.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {isExporting ? 'Generating PDF...' : 'Download PDF'}
                </button>
                <button
                    onClick={runDeepAnalysis}
                    disabled={analyzing || isExporting}
                    className="text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-1.5 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                    {analyzing ? 'Updating...' : 'Refresh Analysis'}
                </button>
            </div>
        </div>
    );
}
