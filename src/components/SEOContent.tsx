'use client';

import React from 'react';

export function SEOContent() {
    return (
        <section className="bg-[var(--clr-surface)] border-t border-[var(--clr-border)] py-12 mt-8 overflow-hidden">
            <div className="container mx-auto px-4 max-w-4xl">
                <div className="prose dark:prose-invert prose-blue max-w-none">
                    <h2 className="text-2xl md:text-3xl font-bold text-[var(--clr-text)] mb-6 font-['Space_Grotesk'] tracking-tight">
                        Comprehensive Pre-Market Stock Analysis & Real-Time Data
                    </h2>

                    <div className="space-y-6 text-[var(--clr-subtext)] leading-relaxed">
                        <p>
                            In the world of modern finance, the ability to track <strong className="text-blue-500">pre-market prices</strong> is no longer just a luxury for institutional traders; it is a necessity for every serious investor. PreMarketPrice provides a state-of-the-art platform designed to bring transparency to the early hours of trading on major US exchanges, including the New York Stock Exchange (NYSE) and NASDAQ.
                        </p>

                        <h3 className="text-xl font-semibold text-[var(--clr-text)] mt-8">What is Pre-Market Trading?</h3>
                        <p>
                            Pre-market trading occurs before the regular market session begins, typically between 4:00 AM and 9:30 AM ET. During these hours, activity is often driven by corporate earnings releases, overnight news, and global economic events. Our platform aggregates this data in real-time, allowing you to witness price discovery as it happens, well before the opening bell.
                        </p>

                        <h3 className="text-xl font-semibold text-[var(--clr-text)] mt-8">Real-Time Earnings Calendar & Market Metrics</h3>
                        <p>
                            Success in pre-market trading requires more than just price tracking. We integrate a robust <strong>earnings calendar</strong> that highlights critical upcoming releases for S&P 500 companies and beyond. By combining live price movements with fundamental data such as market capitalization and volatility metrics, PreMarketPrice offers a 360-degree view of the market's anticipated direction.
                        </p>

                        <div className="bg-blue-600/10 border-l-4 border-blue-600 p-6 my-8 rounded-r-lg">
                            <h4 className="text-blue-500 font-bold mb-2 uppercase tracking-wider text-xs">Platform Methodology</h4>
                            <p className="text-sm italic">
                                Our data is sourced from industry-leading providers like Polygon.io and Finnhub, ensuring high accuracy and low latency. While pre-market trading involves lower liquidity and higher spreads than regular sessions, our visualization tools (like our unique Market Heatmap) help identify real momentum from statistical noise.
                            </p>
                        </div>

                        <h3 className="text-xl font-semibold text-[var(--clr-text)] mt-8">Maximize Your Trading Edge</h3>
                        <p>
                            Whether you are monitoring your personal portfolio or scouting for the next big market mover, our platform is built to deliver. From <strong className="text-blue-600 dark:text-blue-400">Altman Z-Scores</strong> (coming soon) to historical valuation percentiles, we are committed to providing deep, actionable insights that were previously reserved for professional terminals.
                        </p>

                        <div className="flex flex-wrap gap-4 pt-8 border-t border-[var(--clr-border-subtle)]">
                            <span className="text-xs font-mono uppercase tracking-widest text-[var(--clr-subtext)]">Data Partners:</span>
                            <span className="text-xs font-bold text-gray-400">Polygon.io</span>
                            <span className="text-xs font-bold text-gray-400">Finnhub.io</span>
                            <span className="text-xs font-bold text-gray-400">SEC EDGAR</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
