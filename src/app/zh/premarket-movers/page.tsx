import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { detectSession, mapToRedisSession } from '@/lib/utils/timeUtils';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { getDateET, getManyLastWithDate, getRankedSymbols } from '@/lib/redis/ranking';
import { getEligibleAnalysisSet } from '@/lib/seo/eligibleTickers';

export const revalidate = 60;

function getTodayFormatted(): string {
  return new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', year: 'numeric' });
}

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata({
    title: `今日美股盘前异动股 (${getTodayFormatted()})`,
    description:
      '今日美股盘前涨幅和跌幅最大的股票排行 — 实时价格、涨跌幅、Z-Score 异动评分。覆盖 NYSE 和 NASDAQ,盘前时段(美东 4:00–9:30)持续更新。',
    path: '/zh/premarket-movers',
    keywords: ['美股盘前', '盘前异动', '盘前涨幅榜', '美股涨跌', 'premarket movers', '盘前交易'],
    languages: {
      en: '/premarket-movers',
      'zh-CN': '/zh/premarket-movers',
      'x-default': '/premarket-movers',
    },
  });
}

type MoverRow = {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  changePct?: number;
  zscore?: number;
  reason?: string;
  category?: string;
};

async function getTopMovers(order: 'asc' | 'desc', limit: number): Promise<MoverRow[]> {
  const detected = detectSession();
  const mapped = detected === 'closed' ? 'after' : (detected as 'pre' | 'live' | 'after');
  const session = mapToRedisSession(mapped) ?? 'after';
  const date = getDateET();

  const symbols = await getRankedSymbols(date, session, 'chg', order, 0, limit);
  const last = await getManyLastWithDate(date, session, symbols);

  return symbols
    .map((symbol) => {
      const d = last.get(symbol) ?? {};
      return {
        symbol,
        name: d.name,
        sector: d.sector,
        price: d.p,
        changePct: d.change_pct,
        zscore: d.z,
        reason: d.reason,
        category: d.cat,
      };
    })
    .filter((r) => (order === 'desc' ? (r.changePct ?? 0) > 0.01 : (r.changePct ?? 0) < -0.01));
}

function ZhMoversTable({
  title,
  rows,
  eligibleAnalysis,
}: {
  title: string;
  rows: MoverRow[];
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
              <th className="px-4 py-2 text-center">Z-Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.changePct ?? 0;
              const color =
                pct > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : pct < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-400';
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
                  <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">{formatPrice(r.price)}</td>
                  <td className={`px-4 py-2 tabular-nums font-semibold ${color}`}>{formatPercent(pct)}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${Math.abs(r.zscore || 0) > 2.5 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-slate-500'}`}>
                      {r.zscore?.toFixed(1) || '0.0'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-600 dark:text-slate-400" colSpan={6}>
                  暂无数据 — 盘前时段(美东 4:00–9:30)持续更新。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ZhPremarketMoversPage() {
  const [gainers, losers, eligibleAnalysis] = await Promise.all([
    getTopMovers('desc', 30),
    getTopMovers('asc', 30),
    getEligibleAnalysisSet(),
  ]);

  const today = getTodayFormatted();
  const topGainer = gainers[0];
  const topLoser = losers[0];

  const toJsonLd = (schema: object) => JSON.stringify(schema).replace(/</g, '\\u003c');
  const baseUrl = 'https://premarketprice.com';

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
            ? `截至${today},盘前涨幅最大的是 ${topGainer.name ?? topGainer.symbol}(${topGainer.symbol}),涨幅 ${formatPercent(topGainer.changePct ?? 0)};跌幅最大的是 ${topLoser.name ?? topLoser.symbol}(${topLoser.symbol}),跌幅 ${formatPercent(topLoser.changePct ?? 0)}。`
            : '盘前排行在交易时段内持续更新。',
        },
      },
      {
        '@type': 'Question',
        name: 'Z-Score 是什么意思?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Z-Score 衡量个股当前涨跌幅相对于近期波动的异常程度,超过 2.5 表示统计上显著的异动。',
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
            {topGainer && ` 涨幅最大:${topGainer.name ?? topGainer.symbol}(${topGainer.symbol})${formatPercent(topGainer.changePct ?? 0)}。`}
            {topLoser && ` 跌幅最大:${topLoser.name ?? topLoser.symbol}(${topLoser.symbol})${formatPercent(topLoser.changePct ?? 0)}。`}
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
              <strong>Z-Score</strong> 衡量异动显著性:超过 2.5 表示统计上显著偏离近期常态。点击股票代码可查看该股的完整分析(英文页面),包括财务健康评分、估值与盘前价格。
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ZhMoversTable title="盘前涨幅榜" rows={gainers} eligibleAnalysis={eligibleAnalysis} />
          <ZhMoversTable title="盘前跌幅榜" rows={losers} eligibleAnalysis={eligibleAnalysis} />
        </div>

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
