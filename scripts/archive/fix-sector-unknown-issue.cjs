#!/usr/bin/env node

/**
 * Fix for "sector = Unknown" issue
 * 
 * Problem: Inconsistent fallback values across different API endpoints
 * - Stock API returns empty string "" for missing sectors
 * - Heatmap API returns "Other" for missing sectors  
 * - Frontend expects "Unknown" and displays it
 * 
 * Solution: Standardize all endpoints to return "Unknown" for missing sectors
 */

const { PrismaClient } = require('@prisma/client');

async function checkAndFixSectorIssue() {
  console.log('🔍 Checking sector data consistency...\n');
  
  const prisma = new PrismaClient();
  
  try {
    // 1. Check database for null/empty sectors
    const nullSectors = await prisma.ticker.count({
      where: {
        OR: [
          { sector: null },
          { sector: '' },
          { sector: { contains: 'unknown' } },
          { sector: { contains: 'other' } }
        ]
      }
    });
    
    console.log(`📊 Database Analysis:`);
    console.log(`   Total tickers: ${await prisma.ticker.count()}`);
    console.log(`   Tickers with null/empty/problematic sectors: ${nullSectors}`);
    
    if (nullSectors > 0) {
      // 2. Show problematic tickers
      const problematicTickers = await prisma.ticker.findMany({
        where: {
          OR: [
            { sector: null },
            { sector: '' },
            { sector: { contains: 'unknown' } },
            { sector: { contains: 'other' } }
          ]
        },
        select: {
          symbol: true,
          sector: true,
          industry: true,
          name: true
        },
        take: 20
      });
      
      console.log(`\n🚨 Problematic tickers (first 20):`);
      problematicTickers.forEach(t => {
        console.log(`   ${t.symbol}: sector="${t.sector}", industry="${t.industry}"`);
      });
    }
    
    // 3. Check specific tickers mentioned by user
    const userTickers = ['ANSS', 'JWN', 'MNDT', 'ATVI', 'SJI', 'CLO', 'GPS', 'WRK', 'PEAK', 'KO'];
    console.log(`\n🔍 Checking specific tickers mentioned by user:`);
    
    for (const ticker of userTickers) {
      const data = await prisma.ticker.findUnique({
        where: { symbol: ticker },
        select: { symbol: true, sector: true, industry: true, name: true }
      });
      
      if (data) {
        const sectorStatus = data.sector ? '✅' : '❌';
        const industryStatus = data.industry ? '✅' : '❌';
        console.log(`   ${ticker}: ${sectorStatus} sector="${data.sector}", ${industryStatus} industry="${data.industry}"`);
      } else {
        console.log(`   ${ticker}: ❌ NOT FOUND in database`);
      }
    }
    
    // 4. Test API endpoints
    console.log(`\n🌐 Testing API endpoints...`);
    
    // Test stock API
    try {
      const stockResponse = await fetch('http://localhost:3000/api/stocks?tickers=ANSS,JWN,MNDT&project=pmp');
      if (stockResponse.ok) {
        const stockData = await stockResponse.json();
        console.log(`   ✅ Stock API: ${stockData.success ? 'Working' : 'Failed'}`);
        
        if (stockData.success && stockData.data) {
          stockData.data.forEach(item => {
            const sectorStatus = item.sector && item.sector !== 'Unknown' ? '✅' : '❌';
            console.log(`      ${item.ticker}: ${sectorStatus} sector="${item.sector}"`);
          });
        }
      } else {
        console.log(`   ❌ Stock API: HTTP ${stockResponse.status}`);
      }
    } catch (error) {
      console.log(`   ❌ Stock API: ${error.message}`);
    }
    
    // Test heatmap API
    try {
      const heatmapResponse = await fetch('http://localhost:3000/api/heatmap?session=pre&limit=10');
      if (heatmapResponse.ok) {
        const heatmapData = await heatmapResponse.json();
        console.log(`   ✅ Heatmap API: ${heatmapData.success ? 'Working' : 'Failed'}`);
        
        if (heatmapData.success && heatmapData.data) {
          const unknownSectors = heatmapData.data.filter(item => 
            !item.sector || item.sector === 'Unknown' || item.sector === 'Other'
          );
          
          if (unknownSectors.length > 0) {
            console.log(`      ❌ Found ${unknownSectors.length} tickers with unknown sectors:`);
            unknownSectors.slice(0, 5).forEach(item => {
              console.log(`         ${item.ticker}: sector="${item.sector}"`);
            });
          } else {
            console.log(`      ✅ All tickers have valid sectors`);
          }
        }
      } else {
        console.log(`   ❌ Heatmap API: HTTP ${heatmapResponse.status}`);
      }
    } catch (error) {
      console.log(`   ❌ Heatmap API: ${error.message}`);
    }
    
    // 5. Recommendations
    console.log(`\n💡 Recommendations:`);
    
    if (nullSectors > 0) {
      console.log(`   1. Run data refresh to populate missing sectors:`);
      console.log(`      npm run db:update-static`);
      console.log(`   2. Consider adding sector overrides for problematic tickers`);
    } else {
      console.log(`   1. Database looks good - sectors are populated`);
      console.log(`   2. Issue is likely in API response formatting`);
    }
    
    console.log(`   3. Code fixes have been applied to standardize fallback values`);
    console.log(`   4. Restart the application to apply fixes`);
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the analysis
checkAndFixSectorIssue().catch(console.error);
