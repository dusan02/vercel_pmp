'use client';

import { useEffect, useState } from 'react';

interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  image: string | null;
}

function formatTimeAgo(unix: number): string {
  const now = Date.now();
  const diff = now - unix * 1000;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return `${Math.floor(diff / (1000 * 60))}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NewsSection({ ticker }: { ticker: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analysis/${ticker}/news`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (controller.signal.aborted) return;
        setNews(data?.news ?? []);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch news:', err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ticker]);

  // Don't render anything if loading or no news
  if (loading) return null;
  if (news.length === 0) return null;

  return (
    <section className="mb-6 max-w-4xl">
      <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">
            Latest News
          </h2>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            via Finnhub · last 3 days
          </span>
        </div>

        <ul className="space-y-3">
          {news.map((item) => (
            <li key={item.id} className="flex gap-3 group">
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0 hidden sm:block"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug"
                >
                  {item.headline}
                </a>
                {item.summary && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {item.summary}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                  <span className="font-medium">{item.source}</span>
                  <span>·</span>
                  <span>{formatTimeAgo(item.datetime)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
