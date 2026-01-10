import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { normalizeIndustry } from '@/lib/utils/sectorIndustryValidator';

// Fix sectors for tickers that are in "Other" or "Unrecognized" sector
const FIXES: Record<string, { sector: string; industry: string; name?: string }> = {
  'LNG': {
    sector: 'Energy',
    industry: 'Oil & Gas Midstream',
    name: 'Cheniere Energy, Inc.'
  },
  'SE': {
    sector: 'Technology',
    industry: 'Internet Content & Information',
    name: 'Sea Limited'
  },
  'B': {
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    name: 'Barnes Group Inc.'
  },
  'ING': {
    sector: 'Financial Services',
    industry: 'Banks',
    name: 'ING Groep N.V.'
  },
  'HEI': {
    sector: 'Industrials',
    industry: 'Aerospace & Defense',
    name: 'HEICO Corporation'
  },
  'E': {
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    name: 'Eni SpA'
  },
  'NU': {
    sector: 'Financial Services',
    industry: 'Credit Services',
    name: 'Nu Holdings Ltd.'
  },
  'HLN': {
    sector: 'Healthcare',
    industry: 'Drug Manufacturers - General',
    name: 'Haleon plc'
  },
  'NGG': {
    sector: 'Utilities',
    industry: 'Utilities - Regulated Electric',
    name: 'National Grid plc'
  }
};

export async function GET() {
  try {
    const results: any[] = [];

    for (const [symbol, fix] of Object.entries(FIXES)) {
      try {
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
      } catch (error: any) {
        results.push({
          symbol,
          error: error.message || 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${results.filter(r => r.success).length} ticker(s)`,
      results
    });
  } catch (error: any) {
    console.error('❌ Error fixing tickers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
