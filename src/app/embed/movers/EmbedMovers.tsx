'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const SITE_URL = 'https://premarketprice.com';

interface EmbedMover {
  symbol: string;
  name: string | null;
  logoUrl: string | null;
  lastPrice: number;
  lastChangePct: number;
  moversReason: string | null;
}

const SESSION_LABEL: Record<string, string> = {
  pre: 'Pre-market',
  live: 'Regular session',
  after: 'After-hours',
  closed: 'Market closed',
};

/**
 * Embeddable compact movers list — iframed by third-party sites
 * (sidebars, blog posts, newsletters). Strips site chrome, opens links in a
 * new tab, carries a "Powered by" backlink.
 *
 * Params:
 *   ?count=<n>   — rows to show (1–15, default 6)
 *   ?side=all|gainers|losers — filter direction (default all = biggest |move|)
 *   ?reason=1    — show the catalyst line under each row
 *   ?title=0     — hide the "Market Movers" header
 */
export function EmbedMovers() {
  const params = useSearchParams();
  const count = Math.min(Math.max(parseInt(params.get('count') || '6', 10) || 6, 1), 15);
  const side = params.get('side') || 'all';
  const showReason = params.get('reason') === '1';
  const showTitle = params.get('title') !== '0';

  const [movers, setMovers] = useState<EmbedMover[]>([]);
  const [session, setSession] = useState<string>('closed');
  const [error, setError] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark', 'embed-widget');
    document.body.classList.add('embed-widget');
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      root.classList.remove('dark', 'embed-widget');
      document.body.classList.remove('embed-widget');
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/stocks/movers?limit=25&minZ=0');
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!alive) return;
        let list: EmbedMover[] = json.movers ?? [];
        if (side === 'gainers') list = list.filter(m => m.lastChangePct > 0);
        if (side === 'losers') list = list.filter(m => m.lastChangePct < 0);
        setMovers(list.slice(0, count));
        setSession(json.session ?? 'closed');
        setError(false);
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [count, side]);

  const openAnalysis = (symbol: string) => {
    window.open(
      `${SITE_URL}/analysis/${symbol}?utm_source=embed&utm_medium=widget`,
      '_blank',
      'noopener'
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0f0f0f] font-sans">
      {/* Hide site chrome rendered by the root layout around children. */}
      <style>{`
        .embed-widget footer,
        .embed-widget nav,
        .embed-widget div.fixed.bottom-20 { display: none !important; }
        .embed-widget body { overflow: hidden !important; }
      `}</style>

      {showTitle && (
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 px-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Market Movers
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            {SESSION_LABEL[session] ?? session}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {error && movers.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
            Data temporarily unavailable
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {movers.map((m) => {
              const up = m.lastChangePct >= 0;
              return (
                <li key={m.symbol}>
                  <button
                    onClick={() => openAnalysis(m.symbol)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/40 transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.logoUrl || `/logos/${m.symbol.toLowerCase()}-32.webp`}
                      alt=""
                      width={20}
                      height={20}
                      className="h-5 w-5 shrink-0 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[12px] font-bold text-slate-100">{m.symbol}</span>
                        <span className="truncate text-[10px] text-slate-500">
                          {m.name ?? ''}
                        </span>
                      </div>
                      {showReason && m.moversReason && (
                        <div className="truncate text-[10px] text-slate-400">{m.moversReason}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-medium tabular-nums text-slate-300">
                        ${m.lastPrice.toFixed(2)}
                      </div>
                      <div
                        className={`text-[11px] font-bold tabular-nums ${
                          up ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {up ? '+' : ''}{m.lastChangePct.toFixed(1)}%
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <a
        href={`${SITE_URL}/premarket-movers?utm_source=embed&utm_medium=widget`}
        target="_blank"
        rel="noopener"
        className="flex h-7 shrink-0 items-center justify-center gap-1.5 border-t border-slate-800 bg-[#0a0a0a] text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live market data · Powered by <span className="font-semibold text-slate-300">PreMarketPrice</span>
      </a>
    </div>
  );
}
