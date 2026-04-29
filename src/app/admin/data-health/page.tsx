'use client';

import React, { useEffect, useState } from 'react';

export default function DataHealthPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/data-health')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Načítavam stav dát...</div>;
  }

  if (!data?.success) {
    return <div className="p-8 text-center text-red-500">Chyba pri načítavaní dát.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 bg-white dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100">
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Dashboard aktuálnosti a správnosti dát</h1>
      <p className="text-sm text-gray-500 mb-6">Vygenerované: {new Date(data.generatedAt).toLocaleString('sk-SK')}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chýbajúce dáta */}
        <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 dark:border-gray-700">Kompletnosť dát (z {data.totals.totalTickers} spoločností)</h2>
          <ul className="space-y-3">
            <li className="flex justify-between">
              <span>Chýba Current Price:</span>
              <span className={`font-bold ${data.totals.missingData.price > 0 ? 'text-red-500' : 'text-green-500'}`}>{data.totals.missingData.price}</span>
            </li>
            <li className="flex justify-between">
              <span>Chýba Market Cap:</span>
              <span className={`font-bold ${data.totals.missingData.marketCap > 0 ? 'text-red-500' : 'text-green-500'}`}>{data.totals.missingData.marketCap}</span>
            </li>
            <li className="flex justify-between">
              <span>Chýba Market Cap Diff:</span>
              <span className={`font-bold ${data.totals.missingData.marketCapDiff > 0 ? 'text-red-500' : 'text-green-500'}`}>{data.totals.missingData.marketCapDiff}</span>
            </li>
            <li className="flex justify-between">
              <span>Chýba Price Change (%):</span>
              <span className={`font-bold ${data.totals.missingData.changePct > 0 ? 'text-red-500' : 'text-green-500'}`}>{data.totals.missingData.changePct}</span>
            </li>
          </ul>
        </div>

        {/* Aktuálnosť dát */}
        <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 dark:border-gray-700">Aktuálnosť ceny (Freshness)</h2>
          <ul className="space-y-3">
            <li className="flex justify-between">
              <span>Aktualizované &lt; 1h:</span>
              <span className="font-bold text-green-500">{data.freshness.lessThan1Hour}</span>
            </li>
            <li className="flex justify-between">
              <span>Aktualizované 1h - 24h:</span>
              <span className="font-bold text-blue-500">{data.freshness.between1And24Hours}</span>
            </li>
            <li className="flex justify-between">
              <span>Aktualizované 1 - 7 dní:</span>
              <span className="font-bold text-yellow-500">{data.freshness.between1And7Days}</span>
            </li>
            <li className="flex justify-between">
              <span>Staršie ako 7 dní:</span>
              <span className={`font-bold ${data.freshness.olderThan7Days > 0 ? 'text-red-500' : 'text-gray-500'}`}>{data.freshness.olderThan7Days}</span>
            </li>
            <li className="flex justify-between">
              <span>Nikdy neaktualizované (chýba dátum):</span>
              <span className={`font-bold ${data.freshness.missingUpdateDate > 0 ? 'text-red-500' : 'text-gray-500'}`}>{data.freshness.missingUpdateDate}</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Zoznam problémových spoločností */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Ukážka problémových tickerov (max 20)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left border-collapse border border-gray-200 dark:border-gray-700">
            <thead className="text-xs uppercase bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 border border-gray-200 dark:border-gray-700">Symbol</th>
                <th className="px-4 py-3 border border-gray-200 dark:border-gray-700">Price</th>
                <th className="px-4 py-3 border border-gray-200 dark:border-gray-700">Market Cap</th>
                <th className="px-4 py-3 border border-gray-200 dark:border-gray-700">MCap Diff</th>
                <th className="px-4 py-3 border border-gray-200 dark:border-gray-700">Change %</th>
                <th className="px-4 py-3 border border-gray-200 dark:border-gray-700">Posledný update</th>
              </tr>
            </thead>
            <tbody>
              {data.problematicSamples.map((ticker: any) => (
                <tr key={ticker.symbol} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-2 font-bold border border-gray-200 dark:border-gray-700">{ticker.symbol}</td>
                  <td className={`px-4 py-2 border border-gray-200 dark:border-gray-700 ${ticker.lastPrice === null ? 'text-red-500 font-bold' : ''}`}>
                    {ticker.lastPrice ?? 'Chýba'}
                  </td>
                  <td className={`px-4 py-2 border border-gray-200 dark:border-gray-700 ${ticker.lastMarketCap === null ? 'text-red-500 font-bold' : ''}`}>
                    {ticker.lastMarketCap ?? 'Chýba'}
                  </td>
                  <td className={`px-4 py-2 border border-gray-200 dark:border-gray-700 ${ticker.lastMarketCapDiff === null ? 'text-red-500 font-bold' : ''}`}>
                    {ticker.lastMarketCapDiff ?? 'Chýba'}
                  </td>
                  <td className={`px-4 py-2 border border-gray-200 dark:border-gray-700 ${ticker.lastChangePct === null ? 'text-red-500 font-bold' : ''}`}>
                    {ticker.lastChangePct ?? 'Chýba'}
                  </td>
                  <td className={`px-4 py-2 border border-gray-200 dark:border-gray-700 ${!ticker.lastPriceUpdated ? 'text-red-500 font-bold' : ''}`}>
                    {ticker.lastPriceUpdated ? new Date(ticker.lastPriceUpdated).toLocaleString('sk-SK') : 'Chýba'}
                  </td>
                </tr>
              ))}
              {data.problematicSamples.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-green-600 border border-gray-200 dark:border-gray-700">
                    Všetky dáta vyzerajú byť v poriadku!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
