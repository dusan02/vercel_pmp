import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ sector: string }>;
}

// /sector/[sector] is a duplicate of /sectors/[sector].
// Redirect to the canonical plural route to avoid duplicate-content issues.
export default async function SectorSingularRedirect({ params }: PageProps) {
  const { sector } = await params;
  redirect(`/sectors/${sector}`);
}
