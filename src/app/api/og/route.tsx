import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        // Parse parameters
        const symbol = searchParams.get('symbol') || 'TICKER';
        const name = searchParams.get('name') || 'Company Name Inc.';
        const price = searchParams.get('price') || '0.00';
        const changePct = parseFloat(searchParams.get('changePct') || '0');
        const zScore = parseFloat(searchParams.get('zScore') || '0');
        const rvol = parseFloat(searchParams.get('rvol') || '0');
        const category = searchParams.get('category') || 'Technical';
        const reason = searchParams.get('reason') || 'Significant movement detected with statistical confirmation.';
        const isSbc = searchParams.get('sbc') === '1';
        const confidence = parseInt(searchParams.get('confidence') || '0');

        const isPositive = changePct >= 0;
        const color = isPositive ? '#00ff00' : '#ff3b30'; // Bloomberg green / red
        const bgColor = '#000000';
        const accentColor = '#3b82f6';

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: bgColor,
                        padding: '20px',
                        fontFamily: 'sans-serif',
                    }}
                >
                    {/* Bloomberg Grid Overlay Effect */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage: 'radial-gradient(circle, #111 1px, transparent 1px)',
                        backgroundSize: '30px 30px',
                        opacity: 0.3
                    }} />

                    {/* Main Card */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            width: '100%',
                            height: '100%',
                            backgroundColor: '#0a0a0a',
                            borderRadius: '12px',
                            border: '1px solid #333',
                            padding: '40px',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Top Bar / Terminal Header */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '30px',
                            backgroundColor: '#1a1a1a',
                            borderBottom: '1px solid #333',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 15px',
                            fontSize: '12px',
                            color: '#666',
                            fontWeight: 'bold',
                            gap: '20px'
                        }}>
                            <div>TERMINAL: PMP_ALPHA_SIGNAL</div>
                            <div>LOC: NEW_YORK_ET</div>
                            {isSbc && <div style={{ color: '#fbbf24' }}>● SBC_ALERT_ACTIVE</div>}
                        </div>

                        {/* Header: Symbol & Action */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '20px', marginBottom: '32px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ fontSize: '100px', fontWeight: '900', color: 'white', letterSpacing: '-4px', lineHeight: '0.9' }}>
                                        {symbol}
                                    </div>
                                    {isSbc && (
                                        <div style={{
                                            backgroundColor: 'rgba(251, 191, 36, 0.1)',
                                            border: '1px solid #fbbf24',
                                            padding: '4px 12px',
                                            borderRadius: '4px',
                                            color: '#fbbf24',
                                            fontSize: '16px',
                                            fontWeight: '900',
                                            marginTop: '20px'
                                        }}>
                                            SBC ALERT
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff9500', marginTop: '4px', textTransform: 'uppercase' }}>
                                    {name}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <div style={{
                                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                    border: '1px solid #3b82f6',
                                    padding: '6px 16px',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}>
                                    {category}
                                </div>
                                {confidence > 0 && (
                                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                        <div style={{ fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>AI CONFIDENCE</div>
                                        <div style={{ display: 'flex', gap: '3px' }}>
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <div key={i} style={{
                                                    width: '12px',
                                                    height: '12px',
                                                    backgroundColor: i <= Math.ceil(confidence / 20) ? '#3b82f6' : '#222',
                                                    borderRadius: '2px'
                                                }} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Big Metrics */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '48px', backgroundColor: '#111', padding: '30px', borderRadius: '8px', borderLeft: `8px solid ${color}` }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: '14px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>LAST PRICE</div>
                                <div style={{ fontSize: '72px', fontWeight: '900', color: 'white' }}>${price}</div>
                            </div>

                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: '14px', color: '#666', fontWeight: 'bold', marginBottom: '4px' }}>NET CHANGE</div>
                                <div style={{
                                    fontSize: '72px',
                                    fontWeight: '900',
                                    color: color,
                                }}>
                                    {isPositive ? '+' : ''}{changePct.toFixed(2)}%
                                </div>
                            </div>
                        </div>

                        {/* Bottom Stats Grid */}
                        <div style={{ display: 'flex', gap: '20px', flex: 1 }}>
                            {/* Z-Score Box */}
                            <div style={{ flex: 1, backgroundColor: '#111', border: '1px solid #333', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#ff9500', fontWeight: 'bold', marginBottom: '8px' }}>Z-SCORE (VOLATILITY)</div>
                                <div style={{ fontSize: '48px', fontWeight: '900', color: 'white' }}>{zScore > 0 ? '+' : ''}{zScore.toFixed(2)}</div>
                                <div style={{ marginTop: '8px', fontSize: '12px', color: (Math.abs(zScore) >= 3 ? '#ff3b30' : '#666'), fontWeight: 'bold' }}>
                                    {Math.abs(zScore) >= 3 ? 'CRITICAL DEVIATION' : 'SIGNIFICANT DEVIATION'}
                                </div>
                            </div>

                            {/* RVOL Box */}
                            <div style={{ flex: 1, backgroundColor: '#111', border: '1px solid #333', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 'bold', marginBottom: '8px' }}>RVOL (VOLUME MULT)</div>
                                <div style={{ fontSize: '48px', fontWeight: '900', color: 'white' }}>{rvol.toFixed(1)}x</div>
                                <div style={{ marginTop: '8px', fontSize: '12px', color: (rvol >= 2.0 ? '#00ff00' : '#666'), fontWeight: 'bold' }}>
                                    {rvol >= 2.0 ? 'VOLUME CONFIRMATION' : 'NORMAL VOLUME'}
                                </div>
                            </div>

                            {/* AI Reason Box (Wider) */}
                            <div style={{ flex: 2, backgroundColor: '#111', border: '1px solid #333', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: '12px', color: '#666', fontWeight: 'bold', marginBottom: '12px' }}>AI ANALYSIS SUMMARY</div>
                                <div style={{ fontSize: '18px', color: '#ccc', lineHeight: '1.4', fontWeight: 'bold' }}>
                                    "{reason}"
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            marginTop: '32px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            color: '#444',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}>
                            <div style={{ color: 'white' }}>PREMARKET<span style={{ color: '#3b82f6' }}>PRICE</span>.PRO</div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <div>SOURCE: POLYGON_REAL_TIME</div>
                                <div>COPYRIGHT © 2026 PMP_SYSTEMS</div>
                            </div>
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );
    } catch (e: any) {
        console.log(`${e.message}`);
        return new Response(`Failed to generate the image`, {
            status: 500,
        });
    }
}
