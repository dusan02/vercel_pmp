import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { normalizeIndustry } from '@/lib/utils/sectorIndustryValidator';

/**
 * API endpoint to fix TSM sector/industry in database
 * GET /api/fix-tsm
 */
export async function GET() {
  try {
    console.log('🔧 Fixing TSM sector/industry via API...');

    const ticker = await prisma.ticker.findUnique({
      where: { symbol: 'TSM' },
      select: { symbol: true, name: true, sector: true, industry: true }
    });

    if (!ticker) {
      return NextResponse.json(
        { error: 'TSM not found in database' },
        { status: 404 }
      );
    }

    const currentState = {
      symbol: ticker.symbol,
      name: ticker.name || 'N/A',
      sector: ticker.sector || 'NULL',
      industry: ticker.industry || 'NULL'
    };

    const correctSector = 'Technology';
    const correctIndustry = 'Semiconductors';
    const normalizedIndustry = normalizeIndustry(correctSector, correctIndustry) || correctIndustry;

    await prisma.ticker.update({
      where: { symbol: 'TSM' },
      data: {
        sector: correctSector,
        industry: normalizedIndustry,
        updatedAt: new Date()
      }
    });

    // Verify
    const updated = await prisma.ticker.findUnique({
      where: { symbol: 'TSM' },
      select: { symbol: true, name: true, sector: true, industry: true }
    });

    return NextResponse.json({
      success: true,
      message: 'TSM sector/industry fixed successfully',
      before: currentState,
      after: {
        symbol: updated!.symbol,
        name: updated!.name || 'N/A',
        sector: updated!.sector || 'NULL',
        industry: updated!.industry || 'NULL'
      }
    });
  } catch (error) {
    console.error('❌ Error fixing TSM:', error);
    return NextResponse.json(
      { error: 'Failed to fix TSM', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

