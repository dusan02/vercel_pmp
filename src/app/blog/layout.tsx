import { PageHeader } from '@/components/PageHeader';
import { BlogNav } from './BlogNav';

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader navigation={<BlogNav />} />
      {children}
    </>
  );
}
