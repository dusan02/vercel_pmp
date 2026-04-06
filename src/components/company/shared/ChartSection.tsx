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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-lg ${iconBgClass}`}>
                    {icon}
                </div>
                <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
                </div>
            </div>
            {hasData ? children : (
                <div className="text-sm text-gray-400 dark:text-gray-500 italic py-8 text-center">
                    {emptyMessage ?? 'No data available. Click Refresh Analysis to fetch from Polygon.'}
                </div>
            )}
        </div>
    );
}
