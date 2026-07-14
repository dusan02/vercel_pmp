import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { Check } from 'lucide-react';

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Everything you need to track pre-market movers and stay informed.',
    features: [
      'Real-time pre-market prices for 300+ US stocks',
      'Market heatmap with sector breakdown',
      'Top gainers & losers',
      'Earnings calendar',
      'Portfolio tracking (up to 10 stocks)',
      'Favorites / watchlist',
    ],
    cta: 'Start Using Free',
    ctaHref: '/?tab=heatmap',
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/month',
    description: 'Advanced tools for serious traders who need deeper insights.',
    features: [
      'Everything in Free, plus:',
      'Unlimited portfolio holdings',
      'Advanced stock analysis (Altman Z-Score, debt ratios)',
      'Global stock screener with filters',
      'Priority data refresh (faster updates)',
      'Ad-free experience',
      'Email support with 24h response',
    ],
    cta: 'Upgrade to Pro',
    ctaHref: '/contact',
    highlighted: true,
  },
];

function PricingCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`relative rounded-2xl border p-8 flex flex-col ${
        plan.highlighted
          ? 'border-blue-500 dark:border-blue-400 shadow-lg shadow-blue-500/10 bg-blue-50/50 dark:bg-blue-900/10'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
      }`}
    >
      {plan.highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 dark:bg-blue-500 px-4 py-1 text-xs font-semibold text-white">
          Most Popular
        </span>
      )}

      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        {plan.name}
      </h3>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-bold text-gray-900 dark:text-white">
          {plan.price}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {plan.period}
        </span>
      </div>

      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        {plan.description}
      </p>

      <ul className="mt-6 space-y-3 flex-1">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Check
              size={16}
              className={`mt-0.5 flex-shrink-0 ${
                plan.highlighted
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <a
        href={plan.ctaHref}
        className={`mt-8 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
          plan.highlighted
            ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        {plan.cta}
      </a>
    </div>
  );
}

export function HomePricing() {
  return (
    <SectionErrorBoundary sectionName="Pricing">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-3 text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
            Start free and upgrade when you need more. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-3xl mx-auto">
          {PLANS.map((plan) => (
            <PricingCard key={plan.name} plan={plan} />
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400">
          Prices shown in USD. Data provided for informational purposes only — not financial advice.
        </p>
      </div>
    </SectionErrorBoundary>
  );
}
