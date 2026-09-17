import type { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return generatePageMetadata({
    title: 'PreMarketPrice 中文 — 美股盘前行情与异动股',
    description:
      '免费实时美股盘前行情:盘前异动股排行、涨跌榜、财报日历与个股分析。覆盖 NYSE 与 NASDAQ,盘前时段持续更新。',
    path: '/zh',
    keywords: ['美股盘前', '盘前异动', '美股行情', '盘前涨跌', 'US premarket', '美股财报'],
    languages: {
      en: '/',
      'zh-CN': '/zh',
      'x-default': '/',
    },
  });
}

const cards = [
  {
    href: '/zh/premarket-movers',
    title: '盘前异动股',
    desc: '今日盘前涨幅与跌幅最大的美股,按涨跌幅排名,含 Z-Score 异动评分。',
  },
  {
    href: '/premarket-gainers',
    title: '盘前涨幅榜(历史)',
    desc: '按日期浏览过往交易日的盘前涨幅榜归档。',
  },
  {
    href: '/premarket-losers',
    title: '盘前跌幅榜(历史)',
    desc: '按日期浏览过往交易日的盘前跌幅榜归档。',
  },
  {
    href: '/heatmap',
    title: '市场热力图',
    desc: '按板块和市值展示整个美股市场的实时热力图。',
  },
  {
    href: '/earnings',
    title: '财报日历',
    desc: '即将发布的财报日期、EPS 与营收预期。',
  },
  {
    href: '/screener',
    title: '股票筛选器',
    desc: '按板块、价格、市值与盘前涨跌幅筛选美股。',
  },
];

export default function ZhHomePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-10 px-4">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            PreMarketPrice — 美股盘前行情
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            免费追踪美股盘前交易(美东 4:00–9:30):实时价格、涨跌幅排行、异动原因与个股基本面分析。
            盘前时段持续更新,历史数据按交易日归档。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="block p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
            >
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">{c.title}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{c.desc}</p>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-xs text-slate-400 dark:text-slate-500">
          数据来源:Polygon.io、Finnhub。盘前交易时段为美东 4:00–9:30。个股完整分析见英文版{' '}
          <Link href="/" className="underline hover:text-blue-500">premarketprice.com</Link>。
        </p>
      </div>
    </div>
  );
}
