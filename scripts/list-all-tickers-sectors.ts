/**
 * Script to list all tickers with their sectors and industries from production database
 * 
 * Usage:
 * npx tsx scripts/list-all-tickers-sectors.ts
 * 
 * Options:
 * - Output format: JSON, CSV, or table (default: table)
 * - Filter by sector: --sector "Technology"
 * - Filter by industry: --industry "Software"
 * - Show only problematic: --problematic (NULL, Other, Unrecognized sectors)
 */

import { prisma } from '../src/lib/db/prisma.js';

interface TickerInfo {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
}

async function listAllTickers() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const outputFormat = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'table';
  const sectorFilter = args.find(arg => arg.startsWith('--sector='))?.split('=')[1];
  const industryFilter = args.find(arg => arg.startsWith('--industry='))?.split('=')[1];
  const showProblematic = args.includes('--problematic');
  const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1];

  console.log('🔍 Fetching all tickers from database...\n');

  try {
    // Build where clause
    const where: any = {};
    
    if (sectorFilter) {
      where.sector = sectorFilter;
    }
    
    if (industryFilter) {
      where.industry = industryFilter;
    }
    
    if (showProblematic) {
      where.OR = [
        { sector: null },
        { sector: 'Other' },
        { sector: 'Unrecognized' },
        { industry: null }
      ];
    }

    // Fetch all tickers
    const tickers = await prisma.ticker.findMany({
      where,
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

    console.log(`📊 Found ${tickers.length} ticker(s)\n`);

    if (tickers.length === 0) {
      console.log('No tickers found matching the criteria.');
      await prisma.$disconnect();
      return;
    }

    // Process output
    let output: string;

    switch (outputFormat.toLowerCase()) {
      case 'json':
        output = JSON.stringify(tickers, null, 2);
        break;
      
      case 'csv':
        output = generateCSV(tickers);
        break;
      
      case 'table':
      default:
        output = generateTable(tickers);
        break;
    }

    // Output to file or console
    if (outputFile) {
      const fs = await import('fs/promises');
      await fs.writeFile(outputFile, output, 'utf-8');
      console.log(`✅ Output written to ${outputFile}`);
    } else {
      console.log(output);
    }

    // Summary statistics
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary Statistics:');
    console.log('='.repeat(60));
    
    const sectorCounts: Record<string, number> = {};
    const industryCounts: Record<string, number> = {};
    let nullSector = 0;
    let nullIndustry = 0;
    let otherSector = 0;
    let unrecognizedSector = 0;

    tickers.forEach(ticker => {
      // Sector counts
      if (!ticker.sector) {
        nullSector++;
      } else if (ticker.sector === 'Other') {
        otherSector++;
      } else if (ticker.sector === 'Unrecognized') {
        unrecognizedSector++;
      } else {
        sectorCounts[ticker.sector] = (sectorCounts[ticker.sector] || 0) + 1;
      }

      // Industry counts
      if (!ticker.industry) {
        nullIndustry++;
      } else {
        industryCounts[ticker.industry] = (industryCounts[ticker.industry] || 0) + 1;
      }
    });

    console.log(`\nTotal tickers: ${tickers.length}`);
    console.log(`\nSectors:`);
    Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([sector, count]) => {
        console.log(`  ${sector}: ${count}`);
      });
    
    if (nullSector > 0) {
      console.log(`  NULL: ${nullSector}`);
    }
    if (otherSector > 0) {
      console.log(`  Other: ${otherSector}`);
    }
    if (unrecognizedSector > 0) {
      console.log(`  Unrecognized: ${unrecognizedSector}`);
    }

    console.log(`\nIndustries (top 10):`);
    Object.entries(industryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([industry, count]) => {
        console.log(`  ${industry}: ${count}`);
      });
    
    if (nullIndustry > 0) {
      console.log(`  NULL: ${nullIndustry}`);
    }

    if (otherSector > 0 || unrecognizedSector > 0 || nullSector > 0 || nullIndustry > 0) {
      console.log(`\n⚠️  Problematic tickers:`);
      console.log(`  - NULL sector: ${nullSector}`);
      console.log(`  - Other sector: ${otherSector}`);
      console.log(`  - Unrecognized sector: ${unrecognizedSector}`);
      console.log(`  - NULL industry: ${nullIndustry}`);
    }

    console.log('='.repeat(60));

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

function generateTable(tickers: TickerInfo[]): string {
  const lines: string[] = [];
  
  // Header
  lines.push('Symbol'.padEnd(8) + 'Name'.padEnd(40) + 'Sector'.padEnd(25) + 'Industry');
  lines.push('-'.repeat(120));

  // Rows
  tickers.forEach(ticker => {
    const symbol = (ticker.symbol || '').padEnd(8);
    const name = (ticker.name || 'N/A').substring(0, 38).padEnd(40);
    const sector = (ticker.sector || 'NULL').padEnd(25);
    const industry = ticker.industry || 'NULL';
    
    lines.push(symbol + name + sector + industry);
  });

  return lines.join('\n');
}

function generateCSV(tickers: TickerInfo[]): string {
  const lines: string[] = [];
  
  // Header
  lines.push('Symbol,Name,Sector,Industry');

  // Rows
  tickers.forEach(ticker => {
    const symbol = ticker.symbol || '';
    const name = (ticker.name || '').replace(/"/g, '""'); // Escape quotes
    const sector = (ticker.sector || 'NULL').replace(/"/g, '""');
    const industry = (ticker.industry || 'NULL').replace(/"/g, '""');
    
    lines.push(`"${symbol}","${name}","${sector}","${industry}"`);
  });

  return lines.join('\n');
}

// Run the script
listAllTickers().catch(console.error);
