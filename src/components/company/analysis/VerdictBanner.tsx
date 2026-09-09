import React from 'react';

interface VerdictBannerProps {
    isTrap: boolean;
    analyzing: boolean;
    analysisStep: string;
    verdictText: string | null;
}

export function VerdictBanner({ isTrap, analyzing, analysisStep, verdictText }: VerdictBannerProps) {
    if (!verdictText && !analyzing) return null;

    return (
        <div className={`p-6 rounded-xl border-l-4 shadow-sm flex items-start gap-4 transition-all duration-300 ${isTrap
            ? 'bg-red-50/80 dark:bg-red-900/20 border-red-500'
            : 'bg-green-50/80 dark:bg-green-900/20 border-green-500'
            }`}>
            <div className={`mt-0.5 ${isTrap ? 'text-red-500' : 'text-green-500'}`}>
                {isTrap ? (
                    <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                )}
            </div>
            <div>
                <div className="flex items-center gap-2">
                    <h3 className={`text-lg font-bold ${isTrap ? 'text-red-800 dark:text-red-400' : 'text-green-800 dark:text-green-400'}`}>
                        {isTrap ? 'High Risk / Quality Trap' : 'Smart AI Verdict'}
                    </h3>
                    <span title="AI Generated Insight" className="text-xl">✨</span>
                </div>
                {analyzing ? (
                    <div className="mt-2 flex items-center gap-3">
                        <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span>
                        </div>
                        <p className="text-sm font-semibold italic animate-pulse">
                            {analysisStep || 'Analyzing financial health...'}
                        </p>
                    </div>
                ) : (
                    <p className={`text-[15px] mt-2 leading-relaxed font-medium ${isTrap ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                        {verdictText}
                    </p>
                )}
            </div>
        </div>
    );
}
