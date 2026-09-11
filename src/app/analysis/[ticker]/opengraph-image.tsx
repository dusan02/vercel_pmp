import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const alt = 'Stock Analysis';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const symbol = rawTicker.toUpperCase();

  let companyName = symbol;
  let price: number | null = null;
  let changePct: number | null = null;
  let healthScore: number | null = null;
  let sector: string | null = null;

  try {
    const ticker = await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        name: true,
        lastPrice: true,
        lastChangePct: true,
        sector: true,
        analysisCache: { select: { healthScore: true } },
      },
    });

    if (ticker) {
      companyName = ticker.name || symbol;
      price = ticker.lastPrice;
      changePct = ticker.lastChangePct;
      sector = ticker.sector;
      healthScore = ticker.analysisCache?.healthScore ?? null;
    }
  } catch {
    // Fallback to defaults
  }

  const isPositive = (changePct ?? 0) >= 0;
  const changeColor = isPositive ? '#16a34a' : '#dc2626';
  const changeStr = changePct != null ? `${isPositive ? '+' : ''}${changePct.toFixed(2)}%` : '';
  const priceStr = price != null ? `$${price.toFixed(2)}` : '';
  const healthStr = healthScore != null ? `${Math.round(healthScore)}/100` : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo + brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6' }}>PreMarketPrice</div>
        </div>

        {/* Ticker */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '72px', fontWeight: 800, color: '#ffffff' }}>{symbol}</div>
          {sector && (
            <div style={{ fontSize: '24px', color: '#94a3b8' }}>{sector}</div>
          )}
        </div>

        {/* Company name */}
        <div style={{ fontSize: '32px', color: '#cbd5e1', marginBottom: '40px' }}>
          {companyName}
        </div>

        {/* Price + change */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px', marginBottom: '30px' }}>
          {priceStr && (
            <div style={{ fontSize: '48px', fontWeight: 700, color: '#ffffff' }}>{priceStr}</div>
          )}
          {changeStr && (
            <div style={{ fontSize: '36px', fontWeight: 600, color: changeColor }}>
              {isPositive ? '▲' : '▼'} {changeStr}
            </div>
          )}
        </div>

        {/* Health score badge */}
        {healthStr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: (healthScore ?? 0) >= 70 ? '#16a34a' : (healthScore ?? 0) >= 50 ? '#eab308' : '#dc2626',
              borderRadius: '12px',
              padding: '8px 24px',
              fontSize: '28px',
              fontWeight: 700,
              color: '#ffffff',
            }}>
              Health: {healthStr}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '60px',
          right: '60px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '20px',
          color: '#64748b',
        }}>
          <div>premarketprice.com/analysis/{symbol}</div>
          <div>Real-time pre-market data & analysis</div>
        </div>
      </div>
    ),
    size
  );
}
