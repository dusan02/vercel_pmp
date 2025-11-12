/**
 * Script to check sector and industry coverage in database
 * Shows how many tickers have sector/industry data
 */

import { prisma } from '../src/lib/prisma';

async function checkSectorCoverage() {
  try {
    console.log('📊 Checking sector and industry coverage in database...\n');

    // Get total tickers
    const totalTickers = await prisma.ticker.count();
    console.log(`Total tickers in database: ${totalTickers}`);

    // Get tickers with sector
    const tickersWithSector = await prisma.ticker.count({
      where: {
        sector: {
          not: null
        }
      }
    });

    // Get tickers with industry
    const tickersWithIndustry = await prisma.ticker.count({
      where: {
        industry: {
          not: null
        }
      }
    });

    // Get tickers with both
    const tickersWithBoth = await prisma.ticker.count({
      where: {
        sector: {
          not: null
        },
        industry: {
          not: null
        }
      }
    });

    // Get tickers without sector
    const tickersWithoutSector = await prisma.ticker.count({
      where: {
        sector: null
      }
    });

    // Get tickers without industry
    const tickersWithoutIndustry = await prisma.ticker.count({
      where: {
        industry: null
      }
    });

    console.log('\n📈 Coverage Statistics:');
    console.log(`  Tickers with sector: ${tickersWithSector} (${((tickersWithSector / totalTickers) * 100).toFixed(1)}%)`);
    console.log(`  Tickers with industry: ${tickersWithIndustry} (${((tickersWithIndustry / totalTickers) * 100).toFixed(1)}%)`);
    console.log(`  Tickers with both: ${tickersWithBoth} (${((tickersWithBoth / totalTickers) * 100).toFixed(1)}%)`);
    console.log(`  Tickers without sector: ${tickersWithoutSector} (${((tickersWithoutSector / totalTickers) * 100).toFixed(1)}%)`);
    console.log(`  Tickers without industry: ${tickersWithoutIndustry} (${((tickersWithoutIndustry / totalTickers) * 100).toFixed(1)}%)`);

    // Get sample of tickers without sector
    const sampleWithoutSector = await prisma.ticker.findMany({
      where: {
        sector: null
      },
      take: 10,
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      }
    });

    if (sampleWithoutSector.length > 0) {
      console.log('\n📋 Sample tickers without sector:');
      sampleWithoutSector.forEach(t => {
        console.log(`  ${t.symbol} - ${t.name || 'N/A'} (industry: ${t.industry || 'N/A'})`);
      });
    }

    // Get sector distribution
    const sectorDistribution = await prisma.ticker.groupBy({
      by: ['sector'],
      _count: {
        symbol: true
      },
      where: {
        sector: {
          not: null
        }
      },
      orderBy: {
        _count: {
          symbol: 'desc'
        }
      }
    });

    console.log('\n📊 Sector Distribution:');
    sectorDistribution.forEach(s => {
      console.log(`  ${s.sector || 'NULL'}: ${s._count.symbol} tickers`);
    });

  } catch (error) {
    console.error('❌ Error checking sector coverage:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkSectorCoverage();

