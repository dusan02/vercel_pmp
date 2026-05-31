import { redirect } from 'next/navigation';

export default function StocksPage() {
  redirect('/?tab=allStocks');
}

