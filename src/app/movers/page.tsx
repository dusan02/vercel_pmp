import { redirect } from 'next/navigation';

// Canonical redirect: /?tab=movers → /premarket-movers (the proper SEO URL)
export default function MoversRedirect() {
  redirect('/premarket-movers');
}
