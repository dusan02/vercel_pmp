import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { toJsonLd } from '@/lib/seo/jsonLd';
import { prisma } from '@/lib/prisma';

// Render per-request — a static prerender can bake empty rows if the DB
// query returns nothing during build (SQLite contention/dummy build DB).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = generatePageMetadata({
    title: 'Capex Tracker — Companies Spending the Most on Capital Expenditures',
    description:
        'Which US companies spend the most on capex? Track capital expenditures, capex/revenue intensity, year-over-year changes and free cash flow after capex for the biggest infrastructure spenders.',
    path: '/capex-tracker',
    keywords: [
        'capex tracker',
        'capital expenditures',
        'capex by company',
        'ai capex spending',
        'hyperscaler capex',
        'capex to revenue',
        'free cash flow after capex',
        'biggest capex spenders',
    ],
});

interface CapexRow {
    symbol: string;
    name: string | null;
    sector: string | null;
    capex: number;
    prevCapex: number | null;
    revenue: number | null;
    ocf: number | null;
    fiscalYear: number | null;
}

async function getCapexRows(): Promise<CapexRow[]> {
    // Latest two FY statements per symbol — YoY capex change + intensity ratios
    const rows = await prisma.financialStatement.findMany({
        where: { period: 'FY', revenue: { gt: 0 }, capex: { not: null, gt: 0 } },
        orderBy: { endDate: 'desc' },
        select: {
            symbol: true,
            fiscalYear: true,
            endDate: true,
            capex: true,
            revenue: true,
            operatingCashFlow: true,
        },
    });

    const bySymbol = new Map<string, typeof rows>();
    for (const r of rows) {
        const list = bySymbol.get(r.symbol) ?? [];
        if (list.length < 2) {
            list.push(r);
            bySymbol.set(r.symbol, list);
        }
    }

    const symbols = [...bySymbol.keys()];
    const tickers = await prisma.ticker.findMany({
        where: { symbol: { in: symbols } },
        select: { symbol: true, name: true, sector: true },
    });
    const meta = new Map(tickers.map((t) => [t.symbol, t]));

    const out: CapexRow[] = [];
    for (const [symbol, list] of bySymbol) {
        const latest = list[0];
        const prev = list[1] ?? null;
        if (!latest?.capex || latest.capex <= 0) continue;
        out.push({
            symbol,
            name: meta.get(symbol)?.name ?? null,
            sector: meta.get(symbol)?.sector ?? null,
            capex: latest.capex,
            prevCapex: prev?.capex ?? null,
            revenue: latest.revenue,
            ocf: latest.operatingCashFlow,
            fiscalYear: latest.fiscalYear,
        });
    }
    return out.sort((a, b) => b.capex - a.capex).slice(0, 50);
}

function fmtB(v: number | null): string {
    if (v == null) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
    return `${sign}$${abs.toFixed(0)}`;
}

export default async function CapexTrackerPage() {
    const rows = await getCapexRows();
    const totalCapex = rows.reduce((s, r) => s + r.capex, 0);
    const fy = rows[0]?.fiscalYear ?? null;
    const withPrev = rows.filter((r) => r.prevCapex != null && r.prevCapex > 0);
    const medianYoy = withPrev.length
        ? (withPrev.map((r) => r.capex / r.prevCapex! - 1).sort((a, b) => a - b)[Math.floor(withPrev.length / 2)]! * 100)
        : null;

    const itemListSchema = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Capex Tracker',
        numberOfItems: rows.length,
        itemListElement: rows.slice(0, 25).map((r, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: `${r.name ?? r.symbol} (${r.symbol})`,
            url: `https://premarketprice.com/analysis/${r.symbol}`,
        })),
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(itemListSchema) }} />
            <div className="min-h-screen bg-white dark:bg-slate-900">
                <div className="container mx-auto py-8 px-4 max-w-6xl">
                    <nav className="text-sm text-slate-500 dark:text-slate-400 mb-4" aria-label="Breadcrumb">
                        <Link href="/" className="hover:underline">Home</Link>
                        {' / '}
                        <span className="text-slate-700 dark:text-slate-300">Capex Tracker</span>
                    </nav>

                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Capex Tracker</h1>
                    <div className="mt-3 space-y-2 max-w-3xl">
                        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                            The 50 US-listed companies spending the most on capital expenditures in their
                            latest fiscal year{fy ? ` (FY${fy})` : ''}. Capex intensity (capex / revenue)
                            shows how capital-hungry each business model is — from asset-light software
                            to hyperscale data-center buildouts.
                        </p>
                    </div>

                    {/* Aggregate stats */}
                    <div className="flex flex-wrap gap-x-8 gap-y-2 mt-5 mb-6">
                        <div>
                            <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtB(totalCapex)}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">Combined FY capex — top 50</div>
                        </div>
                        {medianYoy != null && (
                            <div>
                                <div className={`text-2xl font-bold tabular-nums ${medianYoy >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {medianYoy >= 0 ? '+' : ''}{medianYoy.toFixed(0)}%
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Median YoY capex change</div>
                            </div>
                        )}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    <th className="px-3 py-2 w-10">#</th>
                                    <th className="px-3 py-2">Company</th>
                                    <th className="px-3 py-2 hidden md:table-cell">Sector</th>
                                    <th className="px-3 py-2 text-right">Capex{fy ? ` FY${fy}` : ''}</th>
                                    <th className="px-3 py-2 text-right hidden sm:table-cell">YoY</th>
                                    <th className="px-3 py-2 text-right">Capex / Rev</th>
                                    <th className="px-3 py-2 text-right hidden lg:table-cell">Capex / OCF</th>
                                    <th className="px-3 py-2 text-right">FCF after capex</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => {
                                    const yoy = r.prevCapex != null && r.prevCapex > 0 ? r.capex / r.prevCapex - 1 : null;
                                    const capexRev = r.revenue != null && r.revenue > 0 ? r.capex / r.revenue : null;
                                    const capexOcf = r.ocf != null && r.ocf > 0 ? r.capex / r.ocf : null;
                                    const fcf = r.ocf != null ? r.ocf - r.capex : null;
                                    return (
                                        <tr key={r.symbol} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                                            <td className="px-3 py-2">
                                                <Link href={`/analysis/${r.symbol}`} className="group">
                                                    <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">{r.symbol}</span>
                                                    <span className="ml-2 text-slate-500 dark:text-slate-400 text-xs hidden sm:inline">{r.name}</span>
                                                </Link>
                                            </td>
                                            <td className="px-3 py-2 hidden md:table-cell text-slate-500 dark:text-slate-400 text-xs">{r.sector}</td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{fmtB(r.capex)}</td>
                                            <td className={`px-3 py-2 text-right tabular-nums hidden sm:table-cell ${yoy == null ? 'text-slate-400' : yoy >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {yoy == null ? '—' : `${yoy >= 0 ? '+' : ''}${(yoy * 100).toFixed(0)}%`}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                                                {capexRev == null ? '—' : `${(capexRev * 100).toFixed(0)}%`}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell text-slate-600 dark:text-slate-300">
                                                {capexOcf == null ? '—' : `${(capexOcf * 100).toFixed(0)}%`}
                                            </td>
                                            <td className={`px-3 py-2 text-right tabular-nums ${fcf == null ? 'text-slate-400' : fcf >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {fcf == null ? '—' : fmtB(fcf)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">How to read this table</h2>
                        <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-3">
                            <p>
                                <strong>Capex / Revenue</strong> measures capital intensity — above ~10% is a
                                capital-hungry business (data centers, fabs, energy); below ~3% is typical
                                for asset-light software. <strong>Capex / OCF</strong> above 100% means the
                                company invests more than it generates — it must borrow or dilute to fund growth.
                            </p>
                            <p>
                                <strong>FCF after capex</strong> is operating cash flow minus capital
                                expenditures — the cash actually left for dividends, buybacks and debt
                                paydown. The AI infrastructure buildout has pushed hyperscaler capex to
                                record levels; watch whether FCF keeps up.
                            </p>
                            <p>
                                Data comes from SEC-filed annual financial statements. Quarterly
                                breakdowns and cash-flow diagrams are on each company&apos;s{' '}
                                <Link href="/analysis/AAPL" className="text-blue-600 dark:text-blue-400 hover:underline">analysis page</Link>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
