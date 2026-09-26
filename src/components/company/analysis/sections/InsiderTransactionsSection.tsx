import { formatCompactNumber } from '@/lib/utils/heatmapFormat';

export interface InsiderTransactionData {
  change: number;
  filingDate: string;
  transactionDate: string;
  transactionCode: string;
  name?: string | null;
}

interface InsiderTransactionsSectionProps {
  transactions: InsiderTransactionData[];
}

// SEC Form 4 transaction codes → human label + direction.
const CODE_LABELS: Record<string, { label: string; direction: 'buy' | 'sell' | 'neutral' }> = {
  P: { label: 'Open market buy', direction: 'buy' },
  S: { label: 'Open market sale', direction: 'sell' },
  A: { label: 'Grant / award', direction: 'neutral' },
  M: { label: 'Option exercise', direction: 'neutral' },
  F: { label: 'Tax withholding', direction: 'neutral' },
  G: { label: 'Gift', direction: 'neutral' },
  D: { label: 'Disposition', direction: 'sell' },
};

const MAX_ROWS = 5;

function TransactionsTable({ transactions, label }: InsiderTransactionsSectionProps & { label: string }) {
  return (
    <table className="w-full table-fixed text-left">
      <caption className="sr-only">{label}</caption>
      <colgroup>
        <col className="w-[42%] md:w-[18%]" />
        <col className="hidden md:table-column md:w-[27%]" />
        <col className="w-[33%] md:w-[26%]" />
        <col className="w-1/4 md:w-[13%]" />
        <col className="hidden md:table-column md:w-[16%]" />
      </colgroup>
      <thead className="bg-gray-50 dark:bg-gray-900/40 text-[11px] text-gray-500 dark:text-gray-400">
        <tr className="border-b border-gray-100 dark:border-gray-700">
          <th scope="col" className="px-3 py-2 font-medium">Transaction date</th>
          <th scope="col" className="hidden md:table-cell px-3 py-2 font-medium">Insider</th>
          <th scope="col" className="px-3 py-2 font-medium">Transaction</th>
          <th scope="col" className="px-3 py-2 font-medium text-right">Shares</th>
          <th scope="col" className="hidden md:table-cell px-3 py-2 font-medium text-right">Filed</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/70">
        {transactions.map((tx, i) => {
          // Keep desktop columns aligned across the initial and expanded rows.
          // On mobile, insider and filing date stack under the transaction date.
          const meta = CODE_LABELS[tx.transactionCode] ?? { label: tx.transactionCode, direction: 'neutral' as const };
          // Fall back to the sign of `change` when the code is unknown.
          const direction = meta.direction !== 'neutral'
            ? meta.direction
            : tx.change > 0 ? 'buy' : tx.change < 0 ? 'sell' : 'neutral';
          const badge =
            direction === 'buy'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : direction === 'sell'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
          return (
            <tr key={`${tx.transactionDate}-${i}`} className="text-xs text-gray-600 dark:text-gray-300 even:bg-gray-50/50 dark:even:bg-gray-900/20 hover:bg-gray-50 dark:hover:bg-gray-900/40">
              <td className="px-3 py-2 align-top md:align-middle">
                <time dateTime={tx.transactionDate} className="tabular-nums whitespace-nowrap">{tx.transactionDate}</time>
                <div className="md:hidden mt-0.5 font-medium text-gray-800 dark:text-gray-200 break-words">{tx.name || '—'}</div>
                <div className="md:hidden mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  Filed <time dateTime={tx.filingDate} className="tabular-nums">{tx.filingDate}</time>
                </div>
              </td>
              <td className="hidden md:table-cell px-3 py-2 font-medium text-gray-800 dark:text-gray-200 break-words">{tx.name || '—'}</td>
              <td className="px-3 py-2 align-top md:align-middle">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] leading-4 font-semibold uppercase ${badge}`}>
                    {direction === 'buy' ? 'Buy' : direction === 'sell' ? 'Sell' : meta.label}
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{meta.label}</span>
                </div>
              </td>
              <td className={`px-3 py-2 align-top md:align-middle text-right whitespace-nowrap font-semibold tabular-nums ${tx.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : tx.change < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-600 dark:text-gray-300'}`}>
                {tx.change > 0 ? '+' : ''}{formatCompactNumber(tx.change)}
              </td>
              <td className="hidden md:table-cell px-3 py-2 text-right text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                <time dateTime={tx.filingDate}>{tx.filingDate}</time>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function InsiderTransactionsSection({ transactions }: InsiderTransactionsSectionProps) {
  if (transactions.length === 0) return null;

  const visible = transactions.slice(0, MAX_ROWS);
  const remaining = transactions.length - visible.length;

  return (
    <section aria-label="Insider transactions" className="min-w-0 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Insider Transactions</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Recent SEC Form 4 filings · {transactions.length} records</p>
      </div>
      {/* Compact columns keep dates, insider names, transaction types and
          share counts together; mobile rows stack secondary details rather
          than spreading each transaction across half the page. */}
      <div className="overflow-hidden rounded-xl border border-gray-200/80 dark:border-gray-700">
        <TransactionsTable transactions={visible} label="Recent insider transactions" />
        {remaining > 0 && (
          <details className="group/filings border-t border-gray-100 dark:border-gray-700">
            <summary className="flex min-h-10 items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-900/40 cursor-pointer list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
              <span className="group-open/filings:hidden">Show {remaining} more {remaining === 1 ? 'filing' : 'filings'}</span>
              <span className="hidden group-open/filings:inline">Show fewer filings</span>
              <svg className="w-3.5 h-3.5 transition-transform group-open/filings:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </summary>
            <TransactionsTable transactions={transactions.slice(MAX_ROWS)} label="Additional recent insider transactions" />
          </details>
        )}
      </div>
    </section>
  );
}
