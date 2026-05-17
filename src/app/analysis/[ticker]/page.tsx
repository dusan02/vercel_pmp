import { Metadata } from 'next';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const target = `https://premarketprice.com/?tab=analysis&ticker=${tickerUpper}`;

  return {
    title: `${tickerUpper} Analysis moved`,
    description: `Redirecting to analysis for ${tickerUpper}.`,
    alternates: { canonical: target },
    robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
  };
}

export default async function AnalysisRedirectPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  redirect(`/?tab=analysis&ticker=${tickerUpper}`);
}
