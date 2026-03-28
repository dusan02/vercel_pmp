import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export default async function CompanyRedirectPage({ params }: PageProps) {
  const { ticker } = await params;
  redirect(`/stock/${ticker.toUpperCase()}`);
}
