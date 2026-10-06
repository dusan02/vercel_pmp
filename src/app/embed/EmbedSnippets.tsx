'use client';

import React, { useState } from 'react';

const SITE_URL = 'https://premarketprice.com';

const WIDGETS = [
  {
    id: 'movers',
    name: 'Market Movers List',
    desc: 'Compact live list of the biggest stock movers — fits sidebars and post footers.',
    src: `${SITE_URL}/embed/movers?count=6`,
    iframe: `<iframe src="${SITE_URL}/embed/movers?count=6" width="320" height="340" style="border:0;border-radius:12px;overflow:hidden" loading="lazy" title="Market Movers — PreMarketPrice"></iframe>`,
    previewW: 320,
    previewH: 340,
    params: [
      'count=6 — number of rows (1–15)',
      'side=gainers|losers — only one direction',
      'reason=1 — show the catalyst under each row',
      'title=0 — hide the header bar',
    ],
  },
  {
    id: 'heatmap',
    name: 'Sector Heatmap',
    desc: 'Full market heatmap — sector tiles sized by market cap, colored by move.',
    src: `${SITE_URL}/embed/heatmap`,
    iframe: `<iframe src="${SITE_URL}/embed/heatmap" width="720" height="480" style="border:0;border-radius:12px;overflow:hidden" loading="lazy" title="Market Heatmap — PreMarketPrice"></iframe>`,
    previewW: 720,
    previewH: 420,
    params: [
      'metric=percent|mcap|pe|health|week… — 27 metrics supported',
    ],
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
      }}
      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy embed code'}
    </button>
  );
}

export function EmbedSnippets() {
  return (
    <div className="space-y-10">
      {WIDGETS.map((w) => (
        <section key={w.id} className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm p-6 md:p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{w.name}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">{w.desc}</p>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="shrink-0 mx-auto lg:mx-0">
              <iframe
                src={w.src}
                width={w.previewW}
                height={w.previewH}
                style={{ border: 0, borderRadius: 12, overflow: 'hidden', maxWidth: '100%' }}
                loading="lazy"
                title={`${w.name} preview`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Embed code
                </span>
                <CopyButton text={w.iframe} />
              </div>
              <pre className="overflow-x-auto rounded-lg bg-gray-100 dark:bg-gray-900 p-3 text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
                {w.iframe}
              </pre>
              <div className="mt-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Options
                </span>
                <ul className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {w.params.map((p) => (
                    <li key={p}><code className="text-blue-600 dark:text-blue-400">{p}</code></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">WordPress / Ghost / Substack?</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Paste the snippet into an HTML/Custom block. On Substack use <em>Embed → iframe URL</em> with
          just <code className="text-blue-600 dark:text-blue-400">{SITE_URL}/embed/movers</code>.
          The widgets are responsive — set any width you need and they adapt.
        </p>
      </section>
    </div>
  );
}
