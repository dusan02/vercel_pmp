import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Demo data for fallback when main APIs fail
    const demoData = [
      {
        t: "AAPL",
        n: "Apple Inc.",
        s: "Technology",
        i: "Consumer Electronics",
        m: 3000000000000,
        c: 1.5,
        d: 2.3,
        p: 195.50,
        u: new Date().toISOString(),
        e: true,
        ps: "session",
        _t: new Date().toISOString()
      },
      {
        t: "MSFT",
        n: "Microsoft Corporation",
        s: "Technology",
        i: "Software",
        m: 2800000000000,
        c: -0.8,
        d: -1.2,
        p: 415.30,
        u: new Date().toISOString(),
        e: true,
        ps: "session",
        _t: new Date().toISOString()
      },
      {
        t: "GOOGL",
        n: "Alphabet Inc.",
        s: "Technology",
        i: "Internet Services",
        m: 1800000000000,
        c: 0.5,
        d: 0.9,
        p: 145.20,
        u: new Date().toISOString(),
        e: true,
        ps: "session",
        _t: new Date().toISOString()
      }
    ];

    return NextResponse.json({
      success: true,
      data: demoData,
      count: demoData.length,
      source: 'demo',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Demo API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Demo API failed',
        data: [],
        count: 0,
        source: 'demo-error'
      },
      { status: 500 }
    );
  }
}
