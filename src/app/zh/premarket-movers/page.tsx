import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatCompactNumber, formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { getEligibleAnalysisSet } from '@/lib/seo/eligibleTickers';
import { getMoversData, type MoverRecord } from '@/services/movers/getMovers';
import { SIGMA_LABELS, type SigmaLevel } from '@/services/movers/classify';

export const revalidate = 60;

// Shared per-request fetch — same Movers 2.0 pipeline as /premarket-movers
// and /api/stocks/movers, so the zh page can never diverge.
const getMovers = cache(() => getMoversData(30, 2.0));

function getTodayFormatted(): string {
  return new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', year: 'numeric' });
}

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata({
    title: `今日美股盘前异动股 (${getTodayFormatted()})`,
    description:
      '今日美股盘前涨幅和跌幅最大的股票排行 — 实时价格、涨跌幅、Z-Score 异动评分与催化剂分析。覆盖 NYSE 和 NASDAQ,盘前时段(美东 4:00–9:30)持续更新。',
    path: '/zh/premarket-movers',
    keywords: ['美股盘前', '盘前异动', '盘前涨幅榜', '美股涨跌', 'premarket movers', '盘前交易'],
    languages: {
      en: '/premarket-movers',
      'zh-CN': '/zh/premarket-movers',
      'x-default': '/premarket-movers',
    },
  });
}

const SIGMA_BADGE: Record<SigmaLevel, string> = {
  extreme: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  very_unusual: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  unusual: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  normal: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

function ZhMoversTable({
  title,
  rows,
  eligibleAnalysis,
}: {
  title: string;
  rows: MoverRecord[];
  eligibleAnalysis: Set<string>;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr className="text-left text-slate-600 dark:text-slate-400">
              <th className="px-4 py-2">代码</th>
              <th className="px-4 py-2">公司</th>
              <th className="px-4 py-2">板块</th>
              <th className="px-4 py-2">价格</th>
              <th className="px-4 py-2">涨跌幅</th>
              <th className="px-4 py-2">成交量</th>
              <th className="px-4 py-2 text-center">σ</th>
              <th className="px-4 py-2">催化剂</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.lastChangePct ?? 0;
              const color =
                pct > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : pct < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-400';
              const sigma = r.analysis?.sigmaLevel ?? 'normal';
              const z = r.latestMoversZScore;
              const a = r.analysis;
              return (
                <tr key={r.symbol} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
                  <td className="px-4 py-2 font-semibold">
                    {eligibleAnalysis.has(r.symbol) ? (
                      <Link className="hover:underline" href={`/analysis/${r.symbol}`}>{r.symbol}</Link>
                    ) : (
                      <span>{r.symbol}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{r.name ?? ''}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{formatSectorName(r.sector || 'Other')}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">{formatPrice(r.lastPrice)}</td>
                  <td className={`px-4 py-2 tabular-nums font-semibold ${color}`}>{formatPercent(pct)}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {r.lastVolume && r.lastVolume > 0 ? formatCompactNumber(r.lastVolume) : '—'}
                    {r.latestMoversRVOL != null && r.latestMoversRVOL >= 1.5 && (
                      <span className="ml-1.5 text-[10px] font-semibold text-blue-500 dark:text-blue-400">
                        {r.latestMoversRVOL.toFixed(1)}×
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${SIGMA_BADGE[sigma]}`}
                      title={`Z-Score ${z?.toFixed(1) ?? '—'} — ${SIGMA_LABELS[sigma]}`}
                    >
                      {z !== null ? `${Math.abs(z).toFixed(1)}σ` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {a ? (
                      <span className="text-slate-700 dark:text-slate-300">
                        {a.catalyst.status === 'found' ? a.catalyst.label : '未检测到明确催化剂'}
                      </span>
                    ) : r.moversReason ? (
                      <span className="text-slate-600 dark:text-slate-400">{r.moversReason}</span>
                    ) : (
                      <span className="text-slate-400 italic">分析中…</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ZhPremarketMoversPage() {
  let moversData: Awaited<ReturnType<typeof getMovers>> | null = null;
  let dataError = false;
  try {
    moversData = await getMovers();
  } catch (e) {
    console.error('[zh/premarket-movers] mover pipeline failed:', e);
    dataError = true;
  }
  const eligibleAnalysis = await getEligibleAnalysisSet();

  const movers = moversData?.movers ?? [];
  const session = moversData?.session ?? 'closed';
  const gainers = movers.filter((m) => (m.lastChangePct ?? 0) > 0.01);
  const losers = movers.filter((m) => (m.lastChangePct ?? 0) < -0.01);

  const today = getTodayFormatted();
  const topGainer = gainers[0];
  const topLoser = losers[0];

  const toJsonLd = (schema: object) => JSON.stringify(schema).replace(/</g, '\\u003c');

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: '什么是盘前异动股?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '盘前异动股是指在美股盘前交易时段(美东时间 4:00–9:30)价格变动最大的股票,通常由财报、分析师评级调整或隔夜新闻驱动。',
        },
      },
      {
        '@type': 'Question',
        name: '今天盘前涨幅最大的股票是哪只?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: topGainer && topLoser
            ? `截至${today},盘前涨幅最大的是 ${topGainer.name ?? topGainer.symbol}(${topGainer.symbol}),涨幅 ${formatPercent(topGainer.lastChangePct ?? 0)};跌幅最大的是 ${topLoser.name ?? topLoser.symbol}(${topLoser.symbol}),跌幅 ${formatPercent(topLoser.lastChangePct ?? 0)}。`
            : '盘前排行在交易时段内持续更新。',
        },
      },
      {
        '@type': 'Question',
        name: 'Z-Score 是什么意思?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Z-Score 衡量个股当前涨跌幅相对于近期波动的异常程度,超过 2.0 表示统计上显著的异动,分为 unusual、very unusual 与 extreme 三个等级。',
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqSchema) }} />
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            今日美股盘前异动股({today})
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            按涨跌幅排名的盘前最大异动股。
            {topGainer && ` 涨幅最大:${topGainer.name ?? topGainer.symbol}(${topGainer.symbol})${formatPercent(topGainer.lastChangePct ?? 0)}。`}
            {topLoser && ` 跌幅最大:${topLoser.name ?? topLoser.symbol}(${topLoser.symbol})${formatPercent(topLoser.lastChangePct ?? 0)}。`}
          </p>
        </div>

        {/* Chinese SEO intro */}
        <section className="mb-8 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">关于盘前交易</h2>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
            <p>
              美股盘前交易时段为美东时间凌晨 4:00 至上午 9:30,即常规开盘之前。在此期间,个股常因隔夜财报、经济数据或全球市场动态而出现显著波动。下表列出 NYSE 与 NASDAQ 中涨跌幅最大的股票。
            </p>
            <p>
              <strong>σ</strong> 列显示个股的 Z-Score — 衡量异动显著性:超过 2.0 表示统计上显著偏离近期常态。<strong>催化剂</strong> 列说明驱动因素(财报、分析师评级、新闻)。点击股票代码可查看该股的完整分析(英文页面),包括财务健康评分、估值与盘前价格。
            </p>
          </div>
        </section>

        {/* Three honest states — same semantics as the EN page */}
        {dataError ? (
          <div className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400">
            实时异动数据暂时不可用,请稍后重试。
          </div>
        ) : movers.length === 0 ? (
          <div className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400">
            {session === 'closed'
              ? '实时异动数据在美股交易时段内提供(盘前、盘中、盘后)。'
              : '当前未检测到显著异动股。'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ZhMoversTable title="盘前涨幅榜" rows={gainers} eligibleAnalysis={eligibleAnalysis} />
            <ZhMoversTable title="盘前跌幅榜" rows={losers} eligibleAnalysis={eligibleAnalysis} />
          </div>
        )}

        {/* Cross-links: zh index + EN equivalents + archives */}
        <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">更多</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" href="/zh">中文首页</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" href="/premarket-movers">English version</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" href="/premarket-gainers">历史涨幅榜</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" href="/premarket-losers">历史跌幅榜</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" href="/heatmap">市场热力图</Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
