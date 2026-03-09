'use client';

import { useState } from 'react';
import AnalysisTab from './AnalysisTab';

interface CompanyTabsProps {
    ticker: string;
}

export default function CompanyTabs({ ticker }: CompanyTabsProps) {
    const [activeTab, setActiveTab] = useState('overview');

    return (
        <div className="mt-8">
            {/* Tabs Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
              ${activeTab === 'overview'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }
            `}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('analysis')}
                        className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
              ${activeTab === 'analysis'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }
            `}
                    >
                        Analysis
                    </button>
                </nav>
            </div>

            {/* Tabs Content */}
            <div className="tab-panels">
                {activeTab === 'overview' && (
                    <div className="animate-fade-in">
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-8 border border-gray-100 dark:border-gray-700 text-center">
                            <h3 className="text-gray-500 dark:text-gray-400">Overview content will go here</h3>
                            {/* V buducnosti sa sem presunu veci z hovedneho page */}
                        </div>
                    </div>
                )}

                {activeTab === 'analysis' && (
                    <AnalysisTab ticker={ticker} />
                )}
            </div>
        </div>
    );
}
