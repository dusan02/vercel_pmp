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
  let closes: number[] = [];

  try {
    const ticker = await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        name: true,
        lastPrice: true,
        lastChangePct: true,
        sector: true,
        analysisCache: { select: { healthScore: true } },
        dailyRefs: {
          orderBy: { date: 'desc' },
          take: 30,
          select: { regularClose: true, previousClose: true },
        },
      },
    });

    if (ticker) {
      companyName = ticker.name || symbol;
      price = ticker.lastPrice;
      changePct = ticker.lastChangePct;
      sector = ticker.sector;
      healthScore = ticker.analysisCache?.healthScore ?? null;
      closes = ticker.dailyRefs
        .map(d => d.regularClose ?? d.previousClose)
        .filter((c): c is number => c != null && c > 0)
        .reverse(); // oldest → newest
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
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#3b82f6', display: 'flex' }}>
            PreMarketPrice
          </div>
        </div>

        {/* Ticker */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', marginBottom: '12px' }}>
          <div style={{ fontSize: '72px', fontWeight: 800, color: '#ffffff', display: 'flex' }}>
            {symbol}
          </div>
          {sector && (
            <div style={{ fontSize: '24px', color: '#94a3b8', display: 'flex' }}>{sector}</div>
          )}
        </div>

        {/* Company name */}
        <div style={{ fontSize: '32px', color: '#cbd5e1', marginBottom: '40px', display: 'flex' }}>
          {companyName}
        </div>

        {/* Price + change + sparkline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '30px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }}>
            {priceStr && (
              <div style={{ fontSize: '48px', fontWeight: 700, color: '#ffffff', display: 'flex' }}>
                {priceStr}
              </div>
            )}
            {changeStr && (
              <div style={{ fontSize: '36px', fontWeight: 600, color: changeColor, display: 'flex' }}>
                {isPositive ? '▲' : '▼'} {changeStr}
              </div>
            )}
          </div>
          {closes.length >= 5 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '64px', marginLeft: 'auto' }}>
              {(() => {
                const min = Math.min(...closes);
                const max = Math.max(...closes);
                const range = max - min || 1;
                const barColor = (closes[closes.length - 1] ?? 0) >= (closes[0] ?? 0) ? '#16a34a' : '#dc2626';
                return closes.map((c, i) => (
                  <div key={i} style={{
                    width: '8px',
                    height: `${10 + ((c - min) / range) * 54}px`,
                    background: barColor,
                    opacity: 0.35 + (i / closes.length) * 0.65,
                    borderRadius: '2px',
                  }} />
                ));
              })()}
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
              PMP Health: {healthStr}
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
          <div style={{ display: 'flex' }}>premarketprice.com/analysis/{symbol}</div>
          <div style={{ display: 'flex' }}>Live pre-market data & analysis</div>
        </div>
      </div>
    ),
    size
  );
}
