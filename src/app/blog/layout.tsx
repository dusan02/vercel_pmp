import { Suspense } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SectionNavigation } from '@/components/SectionNavigation';

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        navigation={
          <Suspense fallback={null}>
            <SectionNavigation />
          </Suspense>
        }
      />
      {children}
    </>
  );
}
