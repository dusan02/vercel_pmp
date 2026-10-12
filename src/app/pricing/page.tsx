import { Metadata } from 'next';
import { HomePricing } from '@/components/home/HomePricing';

export const metadata: Metadata = {
  title: 'Pricing — Simple, Transparent Plans | PreMarketPrice',
  description: 'Start free and upgrade when you need more. No hidden fees, cancel anytime. Real-time pre-market prices, earnings and analysis for 1,000+ US stocks.',
};

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <HomePricing />
    </main>
  );
}
