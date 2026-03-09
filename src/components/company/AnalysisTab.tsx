'use client';

import { useState, useEffect, lazy, Suspense } from 'react';

const ValuationCharts = lazy(() => import('./ValuationCharts'));

function SearchTickerBar({ currentTicker }: { currentTicker: string }) {
    const [value, setValue] = useState('');
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const t = value.toUpperCase().trim();
        if (!t || t === currentTicker) return;
        setValue('');
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mobile-nav-change', {
                detail: { tab: 'analysis', ticker: t }
            }));
        }
    };
    return (
        <form onSubmit={handleSubmit} className="relative w-full max-w-lg">
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                placeholder="Search ticker (e.g. MSFT)"
                className="w-full h-11 pl-4 pr-28 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all"
            />
            <button
                type="submit"
                className="absolute right-1.5 top-1.5 bottom-1.5 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
            >
                Analyze
            </button>
        </form>
    );
}


const LoadingSkeleton = () => (
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

interface AnalysisTabProps {
    ticker: string;
    hideSearch?: boolean;
}

/** Format large numbers as $3.2T / $245.8B / $12.3M */
function formatMarketCap(val: number | null | undefined): string | null {
    if (!val || val <= 0) return null;
    if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toFixed(2)}`;
}

interface AnalysisMetrics {
    zScore: number | null;
    altmanZ: number | null;
    debtRepaymentTime: number | null;
    debtRepaymentYears: number | null;
    fcfYield: number | null;
    currentEps: number | null;
    currentPe: number | null;
    fcfMargin: number | null;
    fcfConversion: number | null;
}

interface AnalysisData {
    healthScore: number | null;
    profitabilityScore: number | null;
    valuationScore: number | null;
    verdictText: string | null;
    updatedAt: string;
    metrics: AnalysisMetrics;
    peers?: string[];
    // Deep-dive metrics (from AnalysisCache)
    piotroskiScore?: number | null;
    beneishScore?: number | null;
    interestCoverage?: number | null;
    revenueCagr?: number | null;
    netIncomeCagr?: number | null;
    // New human-readable info
    humanDebtInfo?: string | null;
    humanPeInfo?: string | null;
    marginStability?: number | null;
    negativeNiYears?: number | null;
    ticker?: {
        name: string | null;
        description: string | null;
        websiteUrl: string | null;
        logoUrl: string | null;
        sector: string | null;
        industry: string | null;
        employees: number | null;
        lastPrice: number | null;
        lastMarketCap: number | null;
    } | null;
}

export default function AnalysisTab({ ticker, hideSearch = false }: AnalysisTabProps) {
    const [data, setData] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Comparison state
    const [compareWith, setCompareWith] = useState<string>('');
    const [compareInput, setCompareInput] = useState<string>('');
    const [secondaryData, setSecondaryData] = useState<AnalysisData | null>(null);
    const [loadingCompare, setLoadingCompare] = useState(false);
    // Collapsible panels
    const [openPanel, setOpenPanel] = useState<'health' | 'profitability' | 'valuation' | null>(null);
    const [analysisStep, setAnalysisStep] = useState<string>('');

    const togglePanel = (p: 'health' | 'profitability' | 'valuation') => setOpenPanel(prev => prev === p ? null : p);

    const analysisSteps = [
        'Connecting to Polygon API...',
        'Syncing financial statements (V3)...',
        'Fetching 1 year of daily aggregates...',
        'Computing valuation multiples...',
        'Calculating Altman Z-Score & Beneish M-Score...',
        'Running Piotroski F-Score analysis...',
        'Finalizing AI Verdict...'
    ];

    useEffect(() => {
        let timer: any;
        if (analyzing) {
            let step = 0;
            setAnalysisStep(analysisSteps[0] || '');
            timer = setInterval(() => {
                step = (step + 1) % analysisSteps.length;
                setAnalysisStep(analysisSteps[step] || '');
            }, 3000);
        } else {
            setAnalysisStep('');
        }
        return () => clearInterval(timer);
    }, [analyzing]);

    useEffect(() => {
        fetchAnalysis();
    }, [ticker]);

    const fetchAnalysis = async (compare?: string) => {
        try {
            setLoading(true);
            setError(null);
            const url = compare
                ? `/api/analysis/${ticker}?compare=${compare}`
                : `/api/analysis/${ticker}`;
            const res = await fetch(url);
            // Non-OK: try to parse error message from API, fall back to null data
            if (!res.ok) {
                try {
                    const errJson = await res.json();
                    console.warn(`Analysis API error (${res.status}):`, errJson);
                } catch {
                    console.warn(`Analysis API returned ${res.status} for ${ticker}`);
                }
                // Treat as "no analysis yet" rather than showing an error banner
                setData(null);
                setSecondaryData(null);
                return;
            }
            const json = await res.json();
            // API now returns { primary, secondary, peers } when comparing
            if (json && json.primary) {
                setData({ ...json.primary, peers: json.peers || [] });
                setSecondaryData(json.secondary || null);
            } else {
                setData(json ? { ...json } : null);
                setSecondaryData(null);
            }
        } catch (err) {
            console.error(err);
            setError('Could not load analysis data. Please try again later.');
        } finally {
            setLoading(false);
        }
    };


    const handleAddComparison = async (symbol?: string) => {
        const target = (symbol || compareInput).toUpperCase().trim();
        if (!target) return;
        setCompareWith(target);
        setLoadingCompare(true);
        await fetchAnalysis(target);
        setLoadingCompare(false);
    };

    const handleRemoveComparison = () => {
        setCompareWith('');
        setCompareInput('');
        setSecondaryData(null);
        fetchAnalysis();
    };

    const runDeepAnalysis = async () => {
        try {
            setAnalyzing(true);
            setError(null);
            const res = await fetch(`/api/analysis/${ticker}`, { method: 'POST' });
            if (!res.ok) throw new Error('Analysis failed');
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.error(err);
            setError('An error occurred during deep analysis.');
        } finally {
            setAnalyzing(false);
        }
    };

    const handleDownloadPDF = async () => {
        setIsExporting(true);
        setError(null);

        // Allow React to re-render without the UI elements if needed, 
        // and let animations settle
        await new Promise((resolve) => setTimeout(resolve, 200));

        try {
            const jsPDF = (await import('jspdf')).default;
            const html2canvas = (await import('html2canvas')).default;

            const element = document.getElementById('analysis-pdf-content');
            if (!element) return;

            const originalBg = element.style.backgroundColor;
            // Force white background for the PDF capture
            element.style.backgroundColor = '#ffffff';

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                onclone: (document) => {
                    document.documentElement.classList.remove('dark'); // Force light theme in clone
                    const el = document.getElementById('analysis-pdf-content');
                    if (el) {
                        el.classList.remove('dark:bg-gray-900', 'bg-transparent');
                        el.classList.add('bg-white');
                        // Fix text colors for PDF readability
                        const textElements = el.querySelectorAll('*');
                        textElements.forEach((node) => {
                            if (node instanceof HTMLElement) {
                                if (node.classList.contains('text-white') || node.classList.contains('dark:text-white')) {
                                    node.style.color = '#111827'; // gray-900
                                }
                                node.classList.remove('dark:text-white', 'dark:text-gray-300', 'dark:text-gray-400', 'dark:text-gray-200');
                            }
                        });
                    }
                }
            });

            element.style.backgroundColor = originalBg;

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            let position = 0;
            const pageHeight = pdf.internal.pageSize.getHeight();

            // Header for PDF
            pdf.setFontSize(16);
            pdf.setTextColor(0, 0, 0);
            pdf.text('PreMarketPrice Analysis', 15, 15);

            pdf.setFontSize(10);
            pdf.setTextColor(100, 100, 100);
            pdf.text(`Ticker: ${ticker} | Generated: ${new Date().toLocaleString()}`, 15, 22);

            pdf.addImage(imgData, 'PNG', 0, 30, pdfWidth, pdfHeight);

            // Handle multi-page if content is too long
            let heightLeft = pdfHeight - (pageHeight - 30);
            while (heightLeft > 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`PMP_Analysis_${ticker}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (err) {
            console.error('Error generating PDF', err);
            setError('Failed to generate PDF report.');
        } finally {
            setIsExporting(false);
        }
    };

    const getColorClass = (score: number | null) => {
        if (score === null) return 'text-gray-500';
        if (score <= 40) return 'text-red-500';
        if (score <= 70) return 'text-yellow-500';
        return 'text-green-500';
    };

    const getStrokeColor = (score: number | null) => {
        if (score === null) return '#9ca3af'; // gray-400
        if (score <= 40) return '#ef4444'; // red-500
        if (score <= 70) return '#eab308'; // yellow-500
        return '#22c55e'; // green-500
    };

    if (loading) return <LoadingSkeleton />;

    if (!data) return (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Analysis Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-6">
                We haven&apos;t performed a deep fundamental analysis for {ticker} yet.
            </p>
            <button
                onClick={runDeepAnalysis}
                disabled={analyzing}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-xl transition-all disabled:opacity-50"
            >
                {analyzing ? 'Starting Analysis...' : 'Run Deep Analysis'}
            </button>
            {error && <p className="text-red-500 mt-4 text-sm font-medium">{error}</p>}
        </div>
    );

    const isTrap = (data.healthScore !== null && data.healthScore < 40) ||
        (data.piotroskiScore !== null && data.piotroskiScore !== undefined && data.piotroskiScore <= 2) ||
        (data.beneishScore !== null && data.beneishScore !== undefined && data.beneishScore > -1.78);

    return (
        <div id="analysis-pdf-content" className={`space-y-6 p-4 bg-transparent dark:bg-gray-900 rounded-xl transition-all ${isExporting ? 'animate-none' : 'animate-fade-in'}`}>

            {/* ── Hero Section: Company Profile + Quick Search ── */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 lg:p-8">

                {/* Quick Search — hidden when a parent (HomeAnalysis) already provides one */}
                {!hideSearch && (
                    <div data-html2canvas-ignore="true" className="mb-6">
                        <SearchTickerBar currentTicker={ticker} />
                    </div>
                )}

                {/* Company Profile */}
                {data.ticker ? (
                    <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
                        {/* Logo */}
                        <div className="flex-shrink-0 w-24 h-24 md:w-32 md:h-32 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center p-3 shadow-sm border border-gray-100 dark:border-gray-700">
                            {data.ticker.logoUrl ? (
                                <img
                                    src={data.ticker.logoUrl}
                                    alt={data.ticker.name || ticker}
                                    className="max-w-full max-h-full object-contain"
                                />
                            ) : (
                                <span className="text-gray-600 dark:text-gray-400 font-black text-2xl">{ticker}</span>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            {/* Name + Ticker badge + Website */}
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white leading-tight">
                                    {data.ticker.name || ticker}
                                </h2>
                                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-sm font-bold rounded-full">
                                    {ticker}
                                </span>
                                {data.ticker.websiteUrl && (
                                    <a
                                        href={data.ticker.websiteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors border border-blue-200 dark:border-blue-700 rounded-full px-3 py-1 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    >
                                        Website ↗
                                    </a>
                                )}
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {[
                                    { label: 'Sector', value: data.ticker.sector },
                                    { label: 'Industry', value: data.ticker.industry?.replace('SIC: ', '') },
                                    { label: 'Market Cap', value: formatMarketCap(data.ticker.lastMarketCap) },
                                    { label: 'Price', value: data.ticker.lastPrice ? `$${data.ticker.lastPrice.toFixed(2)}` : null },
                                    { label: 'Employees', value: data.ticker.employees ? data.ticker.employees.toLocaleString() : null },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3">
                                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-medium">{label}</p>
                                        {value
                                            ? <p className="text-sm font-bold text-gray-900 dark:text-white truncate" title={value}>{value}</p>
                                            : <span className="inline-block animate-pulse bg-gray-200 dark:bg-gray-700 rounded h-4 w-16" aria-label="Loading" />
                                        }
                                    </div>
                                ))}
                            </div>

                            {/* Description */}
                            {data.ticker.description && (
                                <div className="mt-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3">
                                    <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 font-medium">About</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
                                        {data.ticker.description}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-4">
                        <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center border border-gray-200 dark:border-gray-600">
                            <span className="text-gray-600 dark:text-gray-300 font-black text-2xl">{ticker}</span>
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 dark:text-white">{ticker}</h2>
                    </div>
                )}
            </div>

            {/* Run Update / PDF buttons */}
            <div data-html2canvas-ignore="true" className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    Last updated: {new Date(data.updatedAt).toLocaleDateString()}
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

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center gap-2 text-sm border border-red-100 dark:border-red-900/50">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* Warning / Verdict Box */}
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
                            {data.verdictText}
                        </p>
                    )}
                </div>
            </div>



            {/* Compare-with Search Bar */}
            <div data-html2canvas-ignore="true" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {compareWith ? `Comparing: ${ticker} vs ${compareWith}` : 'Compare with a competitor'}
                    </span>
                    {compareWith && (
                        <button onClick={handleRemoveComparison} className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors">
                            ✕ Remove
                        </button>
                    )}
                </div>
                {!compareWith && (
                    <>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Enter ticker (e.g. MSFT)"
                                value={compareInput}
                                onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddComparison()}
                                className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={() => handleAddComparison()}
                                disabled={!compareInput || loadingCompare}
                                className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                            >
                                {loadingCompare ? '...' : 'Add'}
                            </button>
                        </div>
                        {data.peers && data.peers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="text-xs text-gray-400">Sector peers:</span>
                                {data.peers.map((p: string) => (
                                    <button
                                        key={p}
                                        onClick={() => handleAddComparison(p)}
                                        className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 hover:text-blue-700 dark:hover:text-blue-400 px-2 py-1 rounded font-mono transition-colors"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Scorecards */}
            {!compareWith ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <ScoreCard title="Health" score={data.healthScore} colorClass={getColorClass(data.healthScore)} strokeColor={getStrokeColor(data.healthScore)} icon="health" />
                    <ScoreCard title="Profitability" score={data.profitabilityScore} colorClass={getColorClass(data.profitabilityScore)} strokeColor={getStrokeColor(data.profitabilityScore)} icon="profitability" />
                    <ScoreCard title="Valuation" score={data.valuationScore} colorClass={getColorClass(data.valuationScore)} strokeColor={getStrokeColor(data.valuationScore)} icon="valuation" />
                </div>
            ) : (
                <div className="space-y-3">
                    {[{ label: 'Health', p: data.healthScore, s: secondaryData?.healthScore ?? null }, { label: 'Profitability', p: data.profitabilityScore, s: secondaryData?.profitabilityScore ?? null }, { label: 'Valuation', p: data.valuationScore, s: secondaryData?.valuationScore ?? null }].map(({ label, p, s }) => (
                        <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{label} Score</div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-gray-500 mb-1">{ticker}</div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                            <div className={`h-2 rounded-full ${(p || 0) > 70 ? 'bg-green-500' : (p || 0) > 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${p || 0}%` }} />
                                        </div>
                                        <span className={`text-lg font-bold ${getColorClass(p)} ${p !== null && s !== null && p >= s ? 'text-green-500' : ''}`}>
                                            {p ?? 'N/A'}{p !== null && s !== null && p > s ? ' 🏆' : ''}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 mb-1">{compareWith}</div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                            <div className={`h-2 rounded-full ${(s || 0) > 70 ? 'bg-green-500' : (s || 0) > 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${s || 0}%` }} />
                                        </div>
                                        <span className={`text-lg font-bold ${getColorClass(s)} ${s !== null && p !== null && s >= p ? 'text-green-500' : ''}`}>
                                            {s ?? 'N/A'}{s !== null && p !== null && s > p ? ' 🏆' : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {/* Relative Value insight */}
                    {data.valuationScore !== null && secondaryData?.valuationScore !== null && secondaryData?.valuationScore !== undefined && (
                        <div className="text-sm text-center text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg px-4 py-3">
                            <span className="font-medium text-blue-700 dark:text-blue-400">{ticker}</span> has a valuation score of {data.valuationScore} vs {' '}
                            <span className="font-medium text-blue-700 dark:text-blue-400">{compareWith}</span>&apos;s {secondaryData.valuationScore}.{' '}
                            {data.valuationScore > secondaryData.valuationScore
                                ? `${ticker} appears relatively cheaper on our scoring model.`
                                : `${compareWith} appears relatively cheaper on our scoring model.`
                            }
                        </div>
                    )}
                </div>
            )}

            {/* Financial Health Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Financial Health Metrics</h4>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700/50 dark:text-gray-400">
                            <tr>
                                <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">Metric</th>
                                <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">{ticker}</th>
                                {compareWith ? (
                                    <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">{compareWith}</th>
                                ) : (
                                    <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">Status</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {/* Altman Z-Score */}
                            <tr className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900 dark:text-white" title="Predictive model for bankruptcy risk. > 3.0 is Safe, < 1.8 is Distressed.">Altman Z-Score ⓘ</div>
                                    <div className="text-[10px] text-gray-400">Likelihood of bankruptcy (Safe &gt; 3.0)</div>
                                </td>
                                <td className={`px-6 py-4 font-mono ${(data.metrics?.altmanZ || 0) > (secondaryData?.metrics?.altmanZ || 0) && compareWith ? 'text-green-600 font-bold' : ''}`}>
                                    {(data.metrics?.altmanZ || data.metrics?.zScore)?.toFixed(2) || 'N/A'}
                                    {compareWith && (data.metrics?.altmanZ || 0) > (secondaryData?.metrics?.altmanZ || 0) && ' 🏆'}
                                </td>
                                {compareWith ? (
                                    <td className={`px-6 py-4 font-mono ${(secondaryData?.metrics?.altmanZ || 0) > (data.metrics?.altmanZ || 0) ? 'text-green-600 font-bold' : ''}`}>
                                        {(secondaryData?.metrics?.altmanZ || secondaryData?.metrics?.zScore)?.toFixed(2) || 'N/A'}
                                        {(secondaryData?.metrics?.altmanZ || 0) > (data.metrics?.altmanZ || 0) && ' 🏆'}
                                    </td>
                                ) : (
                                    <td className="px-6 py-4">
                                        {(data.metrics?.altmanZ || data.metrics?.zScore) !== undefined && (data.metrics?.altmanZ || data.metrics?.zScore) !== null ? (
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(data.metrics?.altmanZ || data.metrics?.zScore || 0) > 3.0 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                (data.metrics?.altmanZ || data.metrics?.zScore || 0) < 1.8 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                }`}>
                                                {(data.metrics?.altmanZ || data.metrics?.zScore || 0) > 3.0 ? 'Safe' : (data.metrics?.altmanZ || data.metrics?.zScore || 0) < 1.8 ? 'Distress' : 'Grey Zone'}
                                            </span>
                                        ) : <span className="text-gray-400">N/A</span>}
                                    </td>
                                )}
                            </tr>
                            {/* Debt Repayment Time */}
                            <tr className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900 dark:text-white" title="Years needed to pay off debt using FCF. < 3y is Excellent, > 8y is High Risk.">Debt Repayment ⓘ</div>
                                    <div className="text-[10px] text-gray-400">Years to pay debt from Net FCF</div>
                                </td>
                                <td className={`px-6 py-4 font-mono ${compareWith && (data.metrics?.debtRepaymentYears || 99) < (secondaryData?.metrics?.debtRepaymentYears || 99) ? 'text-green-600 font-bold' : ''}`}>
                                    {(data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime)?.toFixed(1) || 'N/A'}y
                                    {compareWith && (data.metrics?.debtRepaymentYears || 99) < (secondaryData?.metrics?.debtRepaymentYears || 99) && ' 🏆'}
                                </td>
                                {compareWith ? (
                                    <td className={`px-6 py-4 font-mono ${(secondaryData?.metrics?.debtRepaymentYears || 99) < (data.metrics?.debtRepaymentYears || 99) ? 'text-green-600 font-bold' : ''}`}>
                                        {(secondaryData?.metrics?.debtRepaymentYears || secondaryData?.metrics?.debtRepaymentTime)?.toFixed(1) || 'N/A'}y
                                        {(secondaryData?.metrics?.debtRepaymentYears || 99) < (data.metrics?.debtRepaymentYears || 99) && ' 🏆'}
                                    </td>
                                ) : (
                                    <td className="px-6 py-4 italic text-xs">
                                        {data.humanDebtInfo || (
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime || 10) < 3 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                (data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime || 0) > 10 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                }`}>
                                                {(data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime || 10) < 3 ? 'Strong' : (data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime || 0) > 10 ? 'Weak' : 'Adequate'}
                                            </span>
                                        )}
                                    </td>
                                )}
                            </tr>
                            {/* FCF Yield */}
                            <tr className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white" title="Free Cash Flow / Market Cap. Higher is better value. > 5% is Good.">FCF Yield ⓘ</td>
                                <td className={`px-6 py-4 font-mono ${compareWith && (data.metrics?.fcfYield || 0) > (secondaryData?.metrics?.fcfYield || 0) ? 'text-green-600 font-bold' : ''}`}>
                                    {data.metrics?.fcfYield !== null && data.metrics?.fcfYield !== undefined ? `${(data.metrics.fcfYield * 100).toFixed(2)}%` : 'N/A'}
                                    {compareWith && (data.metrics?.fcfYield || 0) > (secondaryData?.metrics?.fcfYield || 0) && ' 🏆'}
                                </td>
                                {compareWith ? (
                                    <td className={`px-6 py-4 font-mono ${(secondaryData?.metrics?.fcfYield || 0) > (data.metrics?.fcfYield || 0) ? 'text-green-600 font-bold' : ''}`}>
                                        {secondaryData?.metrics?.fcfYield !== null && secondaryData?.metrics?.fcfYield !== undefined ? `${(secondaryData.metrics.fcfYield * 100).toFixed(2)}%` : 'N/A'}
                                        {(secondaryData?.metrics?.fcfYield || 0) > (data.metrics?.fcfYield || 0) && ' 🏆'}
                                    </td>
                                ) : (
                                    <td className="px-6 py-4">
                                        {data.metrics?.fcfYield !== null && data.metrics?.fcfYield !== undefined ? (
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${data.metrics.fcfYield > 0.05 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                data.metrics.fcfYield < 0 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                }`}>
                                                {data.metrics.fcfYield > 0.05 ? 'High' : data.metrics.fcfYield < 0 ? 'Negative' : 'Moderate'}
                                            </span>
                                        ) : <span className="text-gray-400">N/A</span>}
                                    </td>
                                )}
                            </tr>
                            {/* FCF Margin & Conversion */}
                            <tr className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white" title="FCF Margin & Conversion. Measures how efficiently revenue turns into actual cash.">FCF Quality ⓘ</td>
                                <td className="px-6 py-4">
                                    <div className="text-xs">Margin: <span className="font-mono font-bold">{(data.metrics?.fcfMargin !== undefined && data.metrics?.fcfMargin !== null) ? (data.metrics.fcfMargin * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                                    <div className="text-xs">Conv: <span className="font-mono font-bold">{(data.metrics?.fcfConversion !== undefined && data.metrics?.fcfConversion !== null) ? (data.metrics.fcfConversion * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                                </td>
                                {compareWith ? (
                                    <td className="px-6 py-4">
                                        <div className="text-xs">Margin: <span className="font-mono font-bold">{(secondaryData?.metrics?.fcfMargin !== undefined && secondaryData?.metrics?.fcfMargin !== null) ? (secondaryData.metrics.fcfMargin * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                                        <div className="text-xs">Conv: <span className="font-mono font-bold">{(secondaryData?.metrics?.fcfConversion !== undefined && secondaryData?.metrics?.fcfConversion !== null) ? (secondaryData.metrics.fcfConversion * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                                    </td>
                                ) : (
                                    <td className="px-6 py-4 text-xs text-gray-400">
                                        {(data.metrics?.fcfConversion || 0) > 0.8 ? '✅ Efficient cash conversion' : (data.metrics?.fcfConversion || 0) < 0.5 ? '⚠️ High capex/accruals' : ''}
                                    </td>
                                )}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Deep-Dive Collapsible Panels ── */}
            <div className="space-y-3">
                {/* Health Details */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <button onClick={() => togglePanel('health')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">🏥 Health Details</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'health' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {openPanel === 'health' && (
                        <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-4">
                            {/* Piotroski F-Score */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300" title="Score from 0-9 assessing financial strength. > 7 is Strong, < 3 is Weak.">Piotroski F-Score ⓘ</span>
                                    <div className="flex gap-4 items-center">
                                        <div className="text-right">
                                            <div className="text-[10px] text-gray-400">{ticker}</div>
                                            <span className={`text-base font-bold ${(data.piotroskiScore ?? 0) >= 7 ? 'text-green-500' : (data.piotroskiScore ?? 0) <= 2 ? 'text-red-500' : 'text-yellow-500'}`}>
                                                {data.piotroskiScore ?? 'N/A'}{compareWith && (data.piotroskiScore || 0) > (secondaryData?.piotroskiScore || 0) && ' 🏆'}
                                            </span>
                                        </div>
                                        {compareWith && (
                                            <div className="text-right border-l dark:border-gray-700 pl-4">
                                                <div className="text-[10px] text-gray-400">{compareWith}</div>
                                                <span className={`text-base font-bold ${(secondaryData?.piotroskiScore ?? 0) >= 7 ? 'text-green-500' : (secondaryData?.piotroskiScore ?? 0) <= 2 ? 'text-red-500' : 'text-yellow-500'}`}>
                                                    {secondaryData?.piotroskiScore ?? 'N/A'}{(secondaryData?.piotroskiScore || 0) > (data.piotroskiScore || 0) && ' 🏆'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 flex">
                                    <div className={`h-2 rounded-l-full ${(data.piotroskiScore ?? 0) >= 7 ? 'bg-green-500' : (data.piotroskiScore ?? 0) <= 2 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${((data.piotroskiScore ?? 0) / 9) * (compareWith ? 50 : 100)}%` }} />
                                    {compareWith && (
                                        <div className={`h-2 rounded-r-full border-l border-white dark:border-gray-800 ${(secondaryData?.piotroskiScore ?? 0) >= 7 ? 'bg-green-500' : (secondaryData?.piotroskiScore ?? 0) <= 2 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${((secondaryData?.piotroskiScore ?? 0) / 9) * 50}%` }} />
                                    )}
                                </div>
                            </div>

                            {/* Beneish M-Score */}
                            <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300" title="Model to detect earnings manipulation. < -2.22 is Unlikely, > -1.78 is High Risk.">Beneish M-Score ⓘ</p>
                                    <p className="text-xs text-gray-400">Below -1.78 = No manipulation</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <p className={`text-base font-bold ${data.beneishScore === null || data.beneishScore === undefined ? 'text-gray-400' : data.beneishScore < -1.78 ? 'text-green-500' : 'text-red-500'}`}>
                                            {data.beneishScore !== null && data.beneishScore !== undefined ? data.beneishScore.toFixed(2) : 'N/A'}
                                            {compareWith && (data.beneishScore || 0) < (secondaryData?.beneishScore || 0) && ' 🏆'}
                                        </p>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <p className={`text-base font-bold ${secondaryData?.beneishScore === null || secondaryData?.beneishScore === undefined ? 'text-gray-400' : secondaryData.beneishScore < -1.78 ? 'text-green-500' : 'text-red-500'}`}>
                                                {secondaryData?.beneishScore !== null && secondaryData?.beneishScore !== undefined ? secondaryData.beneishScore.toFixed(2) : 'N/A'}
                                                {(secondaryData?.beneishScore || 0) < (data.beneishScore || 0) && ' 🏆'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Interest Coverage */}
                            <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300" title="EBIT / Interest Expense. Measures ability to pay interest. > 3 is Solid.">Interest Coverage ⓘ</p>
                                    <p className="text-xs text-gray-400">EBIT / Interest Expense</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <span className={`text-base font-bold ${data.interestCoverage === null || data.interestCoverage === undefined ? 'text-gray-400' : data.interestCoverage > 5 ? 'text-green-500' : data.interestCoverage > 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {data.interestCoverage !== null && data.interestCoverage !== undefined ? `${data.interestCoverage.toFixed(1)}x` : 'N/A'}
                                            {compareWith && (data.interestCoverage || 0) > (secondaryData?.interestCoverage || 0) && ' 🏆'}
                                        </span>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <span className={`text-base font-bold ${secondaryData?.interestCoverage === null || secondaryData?.interestCoverage === undefined ? 'text-gray-400' : secondaryData.interestCoverage > 5 ? 'text-green-500' : secondaryData.interestCoverage > 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                {secondaryData?.interestCoverage !== null && secondaryData?.interestCoverage !== undefined ? `${secondaryData.interestCoverage.toFixed(1)}x` : 'N/A'}
                                                {(secondaryData?.interestCoverage || 0) > (data.interestCoverage || 0) && ' 🏆'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Profitability Details */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <button onClick={() => togglePanel('profitability')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">📈 Profitability Details</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'profitability' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {openPanel === 'profitability' && (
                        <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-3">
                            <div className="flex justify-between items-start py-2">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Revenue CAGR (5Y)</p>
                                    <p className="text-xs text-gray-400">Annual revenue growth rate</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <span className={`text-base font-bold ${data.revenueCagr === null || data.revenueCagr === undefined ? 'text-gray-400' : data.revenueCagr > 10 ? 'text-green-500' : data.revenueCagr > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {data.revenueCagr !== null && data.revenueCagr !== undefined ? `${data.revenueCagr.toFixed(1)}%` : 'N/A'}
                                            {compareWith && (data.revenueCagr || -99) > (secondaryData?.revenueCagr || -99) && ' 🏆'}
                                        </span>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <span className={`text-base font-bold ${secondaryData?.revenueCagr === null || secondaryData?.revenueCagr === undefined ? 'text-gray-400' : secondaryData.revenueCagr > 10 ? 'text-green-500' : secondaryData.revenueCagr > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                {secondaryData?.revenueCagr !== null && secondaryData?.revenueCagr !== undefined ? `${secondaryData.revenueCagr.toFixed(1)}%` : 'N/A'}
                                                {(secondaryData?.revenueCagr || -99) > (data.revenueCagr || -99) && ' 🏆'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Net Income CAGR (5Y)</p>
                                    <p className="text-xs text-gray-400">Annual net income growth rate</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <span className={`text-base font-bold ${data.netIncomeCagr === null || data.netIncomeCagr === undefined ? 'text-gray-400' : data.netIncomeCagr > 10 ? 'text-green-500' : data.netIncomeCagr > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {data.netIncomeCagr !== null && data.netIncomeCagr !== undefined ? `${data.netIncomeCagr.toFixed(1)}%` : 'N/A'}
                                            {compareWith && (data.netIncomeCagr || -99) > (secondaryData?.netIncomeCagr || -99) && ' 🏆'}
                                        </span>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <span className={`text-base font-bold ${secondaryData?.netIncomeCagr === null || secondaryData?.netIncomeCagr === undefined ? 'text-gray-400' : secondaryData.netIncomeCagr > 10 ? 'text-green-500' : secondaryData.netIncomeCagr > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                {secondaryData?.netIncomeCagr !== null && secondaryData?.netIncomeCagr !== undefined ? `${secondaryData.netIncomeCagr.toFixed(1)}%` : 'N/A'}
                                                {(secondaryData?.netIncomeCagr || -99) > (data.netIncomeCagr || -99) && ' 🏆'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Valuation Details */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <button onClick={() => togglePanel('valuation')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">💰 Valuation Details</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'valuation' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {openPanel === 'valuation' && (
                        <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-3">
                            <div className="flex justify-between items-start py-2">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">FCF Yield</p>
                                    <p className="text-xs text-gray-400">Higher is better value</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <span className={`text-base font-bold ${data.metrics?.fcfYield === null || data.metrics?.fcfYield === undefined ? 'text-gray-400' : data.metrics.fcfYield > 0.05 ? 'text-green-500' : data.metrics.fcfYield < 0.02 ? 'text-red-500' : 'text-yellow-500'}`}>
                                            {data.metrics?.fcfYield !== null && data.metrics?.fcfYield !== undefined ? `${(data.metrics.fcfYield * 100).toFixed(1)}%` : 'N/A'}
                                            {compareWith && (data.metrics?.fcfYield || 0) > (secondaryData?.metrics?.fcfYield || 0) && ' 🏆'}
                                        </span>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <span className={`text-base font-bold ${secondaryData?.metrics?.fcfYield === null || secondaryData?.metrics?.fcfYield === undefined ? 'text-gray-400' : secondaryData.metrics.fcfYield > 0.05 ? 'text-green-500' : secondaryData.metrics.fcfYield < 0.02 ? 'text-red-500' : 'text-yellow-500'}`}>
                                                {secondaryData?.metrics?.fcfYield !== null && secondaryData?.metrics?.fcfYield !== undefined ? `${(secondaryData.metrics.fcfYield * 100).toFixed(1)}%` : 'N/A'}
                                                {(secondaryData?.metrics?.fcfYield || 0) > (data.metrics?.fcfYield || 0) && ' 🏆'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">P/E Ratio</p>
                                    <p className="text-xs text-gray-400">Price to Earnings</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                                            {data.metrics?.currentPe !== null && data.metrics?.currentPe !== undefined ? `${data.metrics.currentPe.toFixed(1)}x` : 'N/A'}
                                            {compareWith && (data.metrics?.currentPe || 999) < (secondaryData?.metrics?.currentPe || 999) && ' 🏆'}
                                        </p>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                                                {secondaryData?.metrics?.currentPe !== null && secondaryData?.metrics?.currentPe !== undefined ? `${secondaryData.metrics.currentPe.toFixed(1)}x` : 'N/A'}
                                                {(secondaryData?.metrics?.currentPe || 999) < (data.metrics?.currentPe || 999) && ' 🏆'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">{data.humanPeInfo}</div>
                            {compareWith && secondaryData?.humanPeInfo && <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">[{compareWith}] {secondaryData.humanPeInfo}</div>}
                        </div>
                    )}
                </div>

                {/* Stability & Quality Stats */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        Quality & Stability Stats
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="text-xs text-gray-500 mb-1">Margin Volatility (σ)</div>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    <div className={`text-lg font-bold ${compareWith && (data.marginStability || 1) < (secondaryData?.marginStability || 1) ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                        {data.marginStability !== null && data.marginStability !== undefined ? (data.marginStability * 100).toFixed(1) + '%' : 'N/A'}
                                        {compareWith && (data.marginStability || 1) < (secondaryData?.marginStability || 1) && ' 🏆'}
                                    </div>
                                </div>
                                {compareWith && (
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <div className={`text-lg font-bold ${(secondaryData?.marginStability || 1) < (data.marginStability || 1) ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                            {secondaryData?.marginStability !== null && secondaryData?.marginStability !== undefined ? (secondaryData.marginStability * 100).toFixed(1) + '%' : 'N/A'}
                                            {(secondaryData?.marginStability || 1) < (data.marginStability || 1) && ' 🏆'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="text-xs text-gray-500 mb-1">Negative NI Years (10Y)</div>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    <div className={`text-lg font-bold ${compareWith && (data.negativeNiYears || 0) < (secondaryData?.negativeNiYears || 0) ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                        {data.negativeNiYears ?? '0'}y
                                        {compareWith && (data.negativeNiYears || 0) < (secondaryData?.negativeNiYears || 0) && ' 🏆'}
                                    </div>
                                </div>
                                {compareWith && (
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <div className={`text-lg font-bold ${(secondaryData?.negativeNiYears || 0) < (data.negativeNiYears || 0) ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                            {secondaryData?.negativeNiYears ?? '0'}y
                                            {(secondaryData?.negativeNiYears || 0) < (data.negativeNiYears || 0) && ' 🏆'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scenario Lab (5Y Projection) */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 overflow-hidden">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scenario Lab</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Interactive 5-Year Investment Projection</p>
                    </div>
                </div>

                {data.metrics?.currentEps === null || data.metrics?.currentPe === null || data.metrics?.currentEps === undefined || data.metrics?.currentPe === undefined ? (
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg text-center border border-gray-100 dark:border-gray-700/50">
                        <p className="text-gray-500 dark:text-gray-400">Not enough data available to run scenarios. Missing valid EPS or P/E Ratio.</p>
                    </div>
                ) : (
                    <ScenarioCalculator
                        currentEps={data.metrics.currentEps}
                        currentPe={data.metrics.currentPe}
                        currentPrice={data.metrics.currentEps * data.metrics.currentPe}
                    />
                )}
            </div>

            {/* ── Historical Valuation Charts ── */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Historical Valuation Charts</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">10-Year P/E Bands &amp; Revenue Trend</p>
                    </div>
                </div>
                <Suspense fallback={<div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" /></div>}>
                    <ValuationCharts ticker={ticker} />
                </Suspense>
            </div>
        </div>
    );
}

function ScenarioCalculator({ currentEps, currentPe, currentPrice }: { currentEps: number, currentPe: number, currentPrice: number }) {
    const [epsGrowth, setEpsGrowth] = useState<number>(10);
    const [exitPe, setExitPe] = useState<number>(currentPe);

    // Vzorec pre Target Price (o 5 rokov): TargetPrice = EPS_current * (1 + Growth)^5 * P/E_target
    const projectedEps = currentEps * Math.pow(1 + epsGrowth / 100, 5);
    const targetPrice = projectedEps * exitPe;

    // Vzorec pre CAGR (Ročný výnos): CAGR = (TargetPrice / CurrentPrice)^(1/5) - 1
    let cagr = 0;
    if (currentPrice > 0) {
        cagr = (Math.pow(targetPrice / currentPrice, 1 / 5) - 1) * 100;
    }

    const isMarketBeating = cagr > 15;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Inputs */}
            <div className="space-y-6">
                <div>
                    <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <span>Expected Annual EPS Growth (%)</span>
                        <span className="font-mono text-blue-600 dark:text-blue-400">{epsGrowth}%</span>
                    </label>
                    <input
                        type="range"
                        min="-20"
                        max="50"
                        step="1"
                        value={epsGrowth}
                        onChange={(e) => setEpsGrowth(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                        data-html2canvas-ignore="true"
                    />
                    <div data-html2canvas-ignore="true" className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>-20%</span>
                        <span>0%</span>
                        <span>+50%</span>
                    </div>
                </div>

                <div>
                    <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <span>Exit P/E Multiple</span>
                        <span className="font-mono text-blue-600 dark:text-blue-400">{exitPe.toFixed(1)}x</span>
                    </label>
                    <input
                        type="range"
                        min="5"
                        max="100"
                        step="0.5"
                        value={exitPe}
                        onChange={(e) => setExitPe(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                        data-html2canvas-ignore="true"
                    />
                    <div data-html2canvas-ignore="true" className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>Current: {currentPe.toFixed(1)}x</span>
                    </div>
                </div>
            </div>

            {/* Results */}
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current Price</p>
                        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            ${currentPrice.toFixed(2)}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Projected EPS (Year 5)</p>
                        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            ${projectedEps.toFixed(2)}
                        </p>
                    </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div className="flex justify-between items-end mb-2">
                        <p className="text-base font-medium text-gray-600 dark:text-gray-400">Target Price in 5 Years</p>
                        <p className="text-4xl font-bold text-gray-900 dark:text-white">
                            ${targetPrice.toFixed(2)}
                        </p>
                    </div>

                    <div className="flex justify-between items-center mt-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Estimated Annual Return (CAGR)</p>
                        <p className={`text-2xl font-bold flex items-center gap-2 ${cagr > 15 ? 'text-green-500' : cagr > 0 ? 'text-blue-500' : 'text-red-500'
                            }`}>
                            {cagr > 0 ? '+' : ''}{cagr.toFixed(2)}%
                            {isMarketBeating && (
                                <span className="text-[10px] uppercase tracking-wider bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full font-semibold">
                                    Market Beating
                                </span>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ScoreCard({ title, score, colorClass, strokeColor, icon }: { title: string, score: number | null, colorClass: string, strokeColor: string, icon: string }) {
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
