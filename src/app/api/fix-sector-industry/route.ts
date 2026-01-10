import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { normalizeIndustry } from '@/lib/utils/sectorIndustryValidator';

/**
 * API endpoint to fix sector/industry for any ticker
 * 
 * Usage:
 * GET /api/fix-sector-industry?ticker=AAPL&sector=Technology&industry=Consumer Electronics
 * POST /api/fix-sector-industry with body: { ticker: 'AAPL', sector: 'Technology', industry: 'Consumer Electronics' }
 * 
 * For bulk fixes, use POST with array:
 * POST /api/fix-sector-industry with body: { fixes: [{ ticker: 'AAPL', sector: '...', industry: '...' }, ...] }
 */

interface FixRequest {
  ticker?: string;
  sector?: string;
  industry?: string;
  fixes?: Array<{ ticker: string; sector: string; industry: string }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const sector = searchParams.get('sector');
    const industry = searchParams.get('industry');

    if (!ticker || !sector || !industry) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: ticker, sector, industry'
        },
        { status: 400 }
      );
    }

    return await fixTicker(ticker.toUpperCase(), sector, industry);
  } catch (error: any) {
    console.error('❌ Error fixing ticker:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: FixRequest = await request.json();

    // Bulk fix mode
    if (body.fixes && Array.isArray(body.fixes)) {
      const results = [];
      for (const fix of body.fixes) {
        try {
          const result = await fixTickerInternal(fix.ticker, fix.sector, fix.industry);
          results.push(result);
        } catch (error: any) {
          results.push({
            ticker: fix.ticker,
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} fix(es)`,
        results
      });
    }

    // Single fix mode
    if (!body.ticker || !body.sector || !body.industry) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: ticker, sector, industry'
        },
        { status: 400 }
      );
    }

    return await fixTicker(body.ticker.toUpperCase(), body.sector, body.industry);
  } catch (error: any) {
    console.error('❌ Error fixing ticker:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function fixTicker(ticker: string, sector: string, industry: string) {
  const result = await fixTickerInternal(ticker, sector, industry);
  
  if (result.success) {
    return NextResponse.json(result);
  } else {
    return NextResponse.json(result, { status: 400 });
  }
}

async function fixTickerInternal(ticker: string, sector: string, industry: string) {
  const symbol = ticker.toUpperCase();

  // Find ticker
  const existing = await prisma.ticker.findUnique({
    where: { symbol },
    select: { symbol: true, name: true, sector: true, industry: true }
  });

  if (!existing) {
    return {
      ticker: symbol,
      success: false,
      error: 'Ticker not found in database'
    };
  }

  const before = {
    symbol: existing.symbol,
    name: existing.name || 'N/A',
    sector: existing.sector || 'NULL',
    industry: existing.industry || 'NULL'
  };

  // Normalize industry
  const normalizedIndustry = normalizeIndustry(sector, industry) || industry;

  // Update ticker
  await prisma.ticker.update({
    where: { symbol },
    data: {
      sector,
      industry: normalizedIndustry,
      updatedAt: new Date()
    }
  });

  // Verify update
  const updated = await prisma.ticker.findUnique({
    where: { symbol },
    select: { symbol: true, name: true, sector: true, industry: true }
  });

  return {
    ticker: symbol,
    success: true,
    before,
    after: {
      symbol: updated!.symbol,
      name: updated!.name || 'N/A',
      sector: updated!.sector || 'NULL',
      industry: updated!.industry || 'NULL'
    }
  };
}
