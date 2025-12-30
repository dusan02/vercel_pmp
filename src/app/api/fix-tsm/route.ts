import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { normalizeIndustry } from '@/lib/utils/sectorIndustryValidator';

/**
 * API endpoint to fix TSM and RCL sector/industry in database
 * GET /api/fix-tsm?ticker=TSM,RCL
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('ticker') || 'TSM,RCL';
    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase());

    const fixes: { [key: string]: { sector: string; industry: string; name?: string } } = {
      'TSM': { sector: 'Technology', industry: 'Semiconductors', name: 'Taiwan Semiconductor Manufacturing Company' },
      'RCL': { sector: 'Consumer Cyclical', industry: 'Travel Services', name: 'Royal Caribbean Cruises' },
    };

    const results: any[] = [];

    for (const symbol of tickers) {
      const fix = fixes[symbol];
      if (!fix) {
        results.push({
          symbol,
          error: 'No fix mapping available for this ticker'
        });
        continue;
      }

      const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { symbol: true, name: true, sector: true, industry: true }
      });

      if (!ticker) {
        results.push({
          symbol,
          error: 'Ticker not found in database'
        });
        continue;
      }

      const currentState = {
        symbol: ticker.symbol,
        name: ticker.name || 'N/A',
        sector: ticker.sector || 'NULL',
        industry: ticker.industry || 'NULL'
      };

      const normalizedIndustry = normalizeIndustry(fix.sector, fix.industry) || fix.industry;

      const updateData: any = {
        sector: fix.sector,
        industry: normalizedIndustry,
        updatedAt: new Date()
      };

      if (fix.name && (!ticker.name || ticker.name.trim() === '')) {
        updateData.name = fix.name;
      }

      await prisma.ticker.update({
        where: { symbol },
        data: updateData
      });

      // Verify
      const updated = await prisma.ticker.findUnique({
        where: { symbol },
        select: { symbol: true, name: true, sector: true, industry: true }
      });

      results.push({
        symbol,
        success: true,
        before: currentState,
        after: {
          symbol: updated!.symbol,
          name: updated!.name || 'N/A',
          sector: updated!.sector || 'NULL',
          industry: updated!.industry || 'NULL'
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${results.filter(r => r.success).length} ticker(s)`,
      results
    });
  } catch (error) {
    console.error('❌ Error fixing tickers:', error);
    return NextResponse.json(
      { error: 'Failed to fix tickers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

