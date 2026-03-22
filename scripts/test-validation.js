#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  console.log('🚀 Test script starting...');
  
  try {
    const tickerCount = await prisma.ticker.count();
    console.log(`✅ Found ${tickerCount} tickers`);
    
    const sampleTicker = await prisma.ticker.findFirst({
      where: { symbol: 'AAPL' },
      include: { financialStatements: true, analysisCache: true }
    });
    
    if (sampleTicker) {
      console.log('✅ Found AAPL data');
      console.log(`   Price: ${sampleTicker.lastPrice}`);
      console.log(`   Market Cap: ${sampleTicker.lastMarketCap}`);
      console.log(`   Financial statements: ${sampleTicker.financialStatements.length}`);
      console.log(`   Analysis cache: ${sampleTicker.analysisCache ? 'Yes' : 'No'}`);
      
      // Test Altman Z calculation
      const latestStmt = sampleTicker.financialStatements[0];
      if (latestStmt) {
        const totalAssets = latestStmt.totalAssets || 0;
        if (totalAssets > 0) {
          const A = ((latestStmt.currentAssets || 0) - (latestStmt.currentLiabilities || 0)) / totalAssets;
          const B = (latestStmt.retainedEarnings || 0) / totalAssets;
          const C = (latestStmt.ebit || 0) / totalAssets;
          const D = sampleTicker.lastMarketCap && latestStmt.totalLiabilities > 0 
            ? sampleTicker.lastMarketCap / latestStmt.totalLiabilities 
            : 0;
          const E = (latestStmt.revenue || 0) / totalAssets;
          
          const altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
          
          console.log(`   Altman Z: ${altmanZ.toFixed(2)}`);
          console.log(`   Components: A=${A.toFixed(3)}, B=${B.toFixed(3)}, C=${C.toFixed(3)}, D=${D.toFixed(3)}, E=${E.toFixed(3)}`);
          
          // Check if cached value matches
          if (sampleTicker.analysisCache?.altmanZ) {
            const diff = Math.abs(altmanZ - sampleTicker.analysisCache.altmanZ);
            console.log(`   Cached Altman Z: ${sampleTicker.analysisCache.altmanZ.toFixed(2)}`);
            console.log(`   Difference: ${diff.toFixed(4)}`);
            
            if (diff > 0.01) {
              console.log('❌ ALTMAN Z MISMATCH!');
            } else {
              console.log('✅ Altman Z matches cache');
            }
          }
        } else {
          console.log('❌ Total Assets is 0 or missing');
        }
      } else {
        console.log('❌ No financial statements found');
      }
    } else {
      console.log('❌ AAPL not found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
