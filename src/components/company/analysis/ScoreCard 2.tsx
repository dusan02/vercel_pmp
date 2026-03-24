import React from 'react';

export function getColorClass(score: number | null) {
    if (score === null) return 'text-gray-500';
    if (score <= 40) return 'text-red-500';
    if (score <= 70) return 'text-yellow-500';
    return 'text-green-500';
}

export function getStrokeColor(score: number | null) {
    if (score === null) return '#9ca3af'; // gray-400
    if (score <= 40) return '#ef4444'; // red-500
    if (score <= 70) return '#eab308'; // yellow-500
    return '#22c55e'; // green-500
}

interface ScoreCardProps {
    title: string;
    score: number | null;
    colorClass: string;
    strokeColor: string;
    icon: string;
}

export function ScoreCard({ title, score, colorClass, strokeColor, icon }: ScoreCardProps) {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const displayScore = score !== null ? score : 0; // Default to 0 if score is null for calculation
    const strokeDashoffset = circumference - (displayScore / 100) * circumference;

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center relative overflow-hidden group hover:shadow-md transition-shadow">

            {/* Background Icon Watermark */}
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] dark:opacity-[0.02] transform group-hover:scale-110 transition-transform duration-500">
                {icon === 'health' && (
                    <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M4.5 9.5v3h3v-3h-3zm12 0v3h3v-3h-3zm-6 5v3h3v-3h-3zm-6-10v3h3v-3h-3zm12 0v3h3v-3h-3zm-6 5v3h3v-3h-3z" /></svg>
                )}
            </div>

            <h4 className="text-gray-500 dark:text-gray-400 font-medium mb-4 text-sm uppercase tracking-wider">{title} Score</h4>

            <div className="relative w-32 h-32 flex items-center justify-center">
                {/* Background Circle */}
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-gray-100 dark:text-gray-700"
                    />
                    {/* Progress Circle */}
                    <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="transparent"
                        stroke={strokeColor}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>

                {/* Number inside */}
                <div className="absolute flex flex-col items-center justify-center animate-in fade-in zoom-in duration-700">
                    <span className={`text-3xl font-bold ${colorClass}`}>
                        {score}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium mt-0.5">/ 100</span>
                </div>
            </div>
        </div>
    );
}
