import { formatCompactNumber } from '@/lib/utils/heatmapFormat';

export interface InsiderTransactionData {
  change: number;
  filingDate: string;
  transactionDate: string;
  transactionCode: string;
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

export function InsiderTransactionsSection({ transactions }: InsiderTransactionsSectionProps) {
  if (transactions.length === 0) return null;

  const visible = transactions.slice(0, MAX_ROWS);
  const remaining = transactions.length - visible.length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Insider Transactions</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Recent SEC Form 4 filings
      </p>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {visible.map((tx, i) => {
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
            <li key={`${tx.transactionDate}-${i}`} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badge}`}>
                  {direction === 'buy' ? 'Buy' : direction === 'sell' ? 'Sell' : meta.label}
                </span>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {meta.label} · filed {tx.filingDate}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-sm font-semibold tabular-nums ${tx.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : tx.change < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-600 dark:text-gray-300'}`}>
                  {tx.change > 0 ? '+' : ''}{formatCompactNumber(tx.change)} sh
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">{tx.transactionDate}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          +{remaining} more recent filings
        </p>
      )}
    </div>
  );
}
