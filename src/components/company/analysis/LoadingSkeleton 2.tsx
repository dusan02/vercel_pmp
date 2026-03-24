import React from 'react';

export const LoadingSkeleton = () => (
    <div className="animate-pulse space-y-6">
        <div className="bg-gray-100 dark:bg-gray-800/50 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"></div>
            ))}
        </div>
        <div className="h-80 bg-gray-100 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"></div>
    </div>
);
