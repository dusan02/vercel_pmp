import React from 'react';

interface ChartSectionProps {
    iconBgClass: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    children: React.ReactNode;
    emptyMessage?: string;
    hasData?: boolean;
}

export function ChartSection({
    iconBgClass,
    icon,
    title,
    subtitle,
    children,
    emptyMessage,
    hasData = true,
}: ChartSectionProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6 overflow-hidden">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
                <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${iconBgClass}`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate">{title}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
                </div>
            </div>
            {hasData ? children : (
                <div className="text-sm text-gray-400 dark:text-gray-500 italic py-8 text-center">
                    {emptyMessage ?? 'No data available. Click Refresh Analysis to fetch data.'}
                </div>
            )}
        </div>
    );
}
