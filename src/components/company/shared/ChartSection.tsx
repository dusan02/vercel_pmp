import React from 'react';

interface ChartSectionProps {
    iconBgClass: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    children: React.ReactNode;
    emptyMessage?: string;
    hasData?: boolean;
    /** Heading level — h3 inside the AnalysisTab grid, h2 for top-level sections */
    as?: 'h2' | 'h3';
}

export function ChartSection({
    iconBgClass,
    icon,
    title,
    subtitle,
    children,
    emptyMessage,
    hasData = true,
    as: H = 'h3',
}: ChartSectionProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6 overflow-visible h-full flex flex-col">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
                <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${iconBgClass}`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <H className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">{title}</H>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate" title={subtitle}>{subtitle}</p>
                </div>
            </div>
            {hasData ? <div className="flex-1 min-h-0">{children}</div> : (
                <div className="text-sm text-gray-500 dark:text-gray-500 italic py-8 text-center">
                    {emptyMessage ?? 'No data available. Click Refresh Analysis to fetch data.'}
                </div>
            )}
        </div>
    );
}
