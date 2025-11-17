// Server component - clean entry point
// All client logic is in HomePage.tsx
// HomePage.tsx has 'use client' directive, so Next.js handles it correctly
import HomePage from './HomePage';

export default function Page() {
  return <HomePage />;
}
