import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { validateSectorIndustry, normalizeIndustry } from '@/lib/utils/sectorIndustryValidator';

// Known correct mappings for major pharmaceutical and healthcare companies
const knownCorrectMappings: { [key: string]: { sector: string; industry: string } } = {
  // Technology - Semiconductors
  'TSM': { sector: 'Technology', industry: 'Semiconductors' }, // Taiwan Semiconductor Manufacturing Company
  'ASML': { sector: 'Technology', industry: 'Semiconductor Equipment' }, // ASML Holding

  // Healthcare - Drug Manufacturers
  'NVS': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Novartis
  'AZN': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // AstraZeneca
  'GSK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // GlaxoSmithKline
  'SNY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Sanofi
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Eli Lilly
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Johnson & Johnson
  'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Pfizer
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // AbbVie
  'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Merck
  'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Bristol-Myers Squibb
  'NVO': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Novo Nordisk
  'TAK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Takeda

  // Healthcare - Biotechnology
  'AMGN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'GILD': { sector: 'Healthcare', industry: 'Biotechnology' },
  'REGN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'VRTX': { sector: 'Healthcare', industry: 'Biotechnology' },
  'BIIB': { sector: 'Healthcare', industry: 'Biotechnology' },

  // Healthcare - Medical Devices
  'MDT': { sector: 'Healthcare', industry: 'Medical Devices' }, // Medtronic
  'ABT': { sector: 'Healthcare', industry: 'Medical Devices' },
  'BSX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ISRG': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ZTS': { sector: 'Healthcare', industry: 'Medical Devices' },

  // Healthcare - Diagnostics & Research
  'TMO': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'DHR': { sector: 'Healthcare', industry: 'Diagnostics & Research' },

  // Healthcare - Healthcare Plans
  'UNH': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CVS': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CI': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'HUM': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'ELV': { sector: 'Healthcare', industry: 'Healthcare Plans' },
};

// Common incorrect patterns to check
const incorrectPatterns = [
  {
    description: 'Pharmaceutical companies incorrectly in Financial Services',
    check: (ticker: string, sector: string | null, industry: string | null) => {
      const pharmaTickers = ['NVS', 'AZN', 'GSK', 'SNY', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'NVO', 'TAK'];
      return pharmaTickers.includes(ticker) && sector === 'Financial Services';
    },
    fix: (ticker: string) => knownCorrectMappings[ticker] || { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }
  },
  {
    description: 'Medical device companies incorrectly in Financial Services',
    check: (ticker: string, sector: string | null, industry: string | null) => {
      const deviceTickers = ['MDT', 'ABT', 'BSX', 'ISRG', 'ZTS'];
      return deviceTickers.includes(ticker) && sector === 'Financial Services';
    },
    fix: (ticker: string) => knownCorrectMappings[ticker] || { sector: 'Healthcare', industry: 'Medical Devices' }
  }
];

async function verifyAndFixSectorIndustry() {
  console.log('🔍 Starting daily sector/industry verification and fix...\n');

  try {
    // Get all tickers with sector/industry
    const allTickers = await prisma.ticker.findMany({
      where: {
        OR: [
          { sector: { not: null } },
          { industry: { not: null } }
        ]
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
      },
      orderBy: {
        symbol: 'asc'
      }
    });

    console.log(`📊 Found ${allTickers.length} tickers with sector/industry data\n`);

    let fixed = 0;
    const errors: Array<{ ticker: string; current: string; fixed: string; method: 'knownMapping' | 'validationRules' | 'normalizedOnly' }> = [];
    let verified = 0;
    let fixedByKnownMapping = 0;
    let fixedByValidationRules = 0;
    let normalizedOnly = 0;

    for (const ticker of allTickers) {
      const symbol = ticker.symbol;
      const currentSector = ticker.sector;
      const currentIndustry = ticker.industry;

      // Validate current values first
      const isValid = validateSectorIndustry(currentSector, currentIndustry);
      
      // Check if we have a known correct mapping
      if (knownCorrectMappings[symbol]) {
        const correct = knownCorrectMappings[symbol];

        if (currentSector !== correct.sector || currentIndustry !== correct.industry || !isValid) {
          console.log(`❌ ${symbol} (${ticker.name || 'N/A'}):`);
          console.log(`   Current: ${currentSector || 'NULL'} / ${currentIndustry || 'NULL'} ${!isValid ? '(INVALID)' : ''}`);
          console.log(`   Should be: ${correct.sector} / ${correct.industry}`);
          console.log(`   🔴 HIGH IMPORTANCE: Fixed by known mapping (upstream taxonomy may have changed)`);

          // Normalize industry
          const normalizedIndustry = normalizeIndustry(correct.sector, correct.industry);

          // Fix it
          await prisma.ticker.update({
            where: { symbol },
            data: {
              sector: correct.sector,
              industry: normalizedIndustry || correct.industry,
              updatedAt: new Date()
            }
          });

          errors.push({
            ticker: symbol,
            current: `${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`,
            fixed: `${correct.sector} / ${normalizedIndustry || correct.industry}`,
            method: 'knownMapping'
          });

          fixed++;
          fixedByKnownMapping++;
          console.log(`   ✅ Fixed by known mapping!\n`);
        } else {
          verified++;
        }
      } else if (!isValid) {
        // Invalid combination but no known mapping - try pattern matching first
        let needsFix = false;
        let fixData: { sector: string; industry: string } | null = null;

        for (const pattern of incorrectPatterns) {
          if (pattern.check(symbol, currentSector, currentIndustry)) {
            fixData = pattern.fix(symbol);
            needsFix = true;
            break;
          }
        }

        if (needsFix && fixData) {
          console.log(`❌ ${symbol} (${ticker.name || 'N/A'}):`);
          console.log(`   Current: ${currentSector || 'NULL'} / ${currentIndustry || 'NULL'} (INVALID)`);
          console.log(`   Fixed by validation rules: ${fixData.sector} / ${fixData.industry}`);

          const normalizedIndustry = normalizeIndustry(fixData.sector, fixData.industry);

          await prisma.ticker.update({
            where: { symbol },
            data: {
              sector: fixData.sector,
              industry: normalizedIndustry || fixData.industry,
              updatedAt: new Date()
            }
          });

          errors.push({
            ticker: symbol,
            current: `${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`,
            fixed: `${fixData.sector} / ${normalizedIndustry || fixData.industry}`,
            method: 'validationRules'
          });

          fixed++;
          fixedByValidationRules++;
          console.log(`   ✅ Fixed by validation rules!\n`);
        } else {
          // Invalid but no fix available - log warning
          console.log(`⚠️  ${symbol} (${ticker.name || 'N/A'}): Invalid combination - ${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`);
          // Don't fix automatically without known mapping, but log it
          errors.push({
            ticker: symbol,
            current: `${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`,
            fixed: 'NEEDS MANUAL REVIEW',
            method: 'normalizedOnly' // Not actually fixed, but categorized
          });
          normalizedOnly++;
        }
      } else {
        // Valid combination - check against incorrect patterns for edge cases
        let needsFix = false;
        let fixData: { sector: string; industry: string } | null = null;

        for (const pattern of incorrectPatterns) {
          if (pattern.check(symbol, currentSector, currentIndustry)) {
            fixData = pattern.fix(symbol);
            needsFix = true;
            break;
          }
        }

        if (needsFix && fixData) {
          console.log(`❌ ${symbol} (${ticker.name || 'N/A'}):`);
          console.log(`   Current: ${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`);
          console.log(`   Should be: ${fixData.sector} / ${fixData.industry}`);

          const normalizedIndustry = normalizeIndustry(fixData.sector, fixData.industry);

          await prisma.ticker.update({
            where: { symbol },
            data: {
              sector: fixData.sector,
              industry: normalizedIndustry || fixData.industry,
              updatedAt: new Date()
            }
          });

          errors.push({
            ticker: symbol,
            current: `${currentSector || 'NULL'} / ${currentIndustry || 'NULL'}`,
            fixed: `${fixData.sector} / ${normalizedIndustry || fixData.industry}`,
            method: 'validationRules'
          });

          fixed++;
          fixedByValidationRules++;
          console.log(`   ✅ Fixed by validation rules!\n`);
        } else {
          verified++;
        }
      }
    }

    const summary = {
      total: allTickers.length,
      verified,
      fixed,
      errors: errors.map(e => ({
        ticker: e.ticker,
        current: e.current,
        fixed: e.fixed
      }))
    };

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Total tickers checked: ${allTickers.length}`);
    console.log(`   Verified correct: ${verified}`);
    console.log(`   Fixed: ${fixed}`);
    console.log('='.repeat(60));

    return summary;

  } catch (error) {
    console.error('❌ Error during verification:', error);
    throw error;
  }
}

/**
 * POST endpoint pre cron job (Vercel Cron Jobs alebo externý scheduler)
 * Vyžaduje autorizáciu cez CRON_SECRET_KEY
 */
export async function POST(request: NextRequest) {
  try {
    // Overenie autorizácie (cron job security)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`🚀 Starting daily sector/industry verification...`);

    const summary = await verifyAndFixSectorIndustry();

    return NextResponse.json({
      success: true,
      message: 'Sector/industry verification completed',
      ...summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in sector/industry verification cron job:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * GET endpoint pre manuálne spustenie (testing)
 */
export async function GET(request: NextRequest) {
  try {
    // Pre GET endpoint nevyžadujeme autorizáciu (len pre testovanie)
    console.log(`🔍 Manual sector/industry verification triggered...`);

    const summary = await verifyAndFixSectorIndustry();

    return NextResponse.json({
      success: true,
      message: 'Sector/industry verification completed',
      ...summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in sector/industry verification:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

