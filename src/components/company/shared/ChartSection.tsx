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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
                <div className={`p-2 rounded-lg shrink-0 ${iconBgClass}`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">{title}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
                </div>
            </div>
            <div className="w-full overflow-x-auto hide-scrollbar">
                {hasData ? children : (
                    <div className="text-sm text-gray-400 dark:text-gray-500 italic py-8 text-center">
                        {emptyMessage ?? 'No data available. Click Refresh Analysis to fetch from Polygon.'}
                    </div>
                )}
            </div>
        </div>
    );
}
