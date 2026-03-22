#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeScores() {
  try {
    console.log('🔍 Analýza výpočtu skóre...');
    
    // Vyber AAPL pre detailnú analýzu
    const ticker = await prisma.ticker.findUnique({
      where: { symbol: 'AAPL' },
      include: {
        analysisCache: true,
        financialStatements: {
          orderBy: { endDate: 'desc' },
          take: 5
        }
      }
    });
    
    if (!ticker) {
      console.log('❌ AAPL neexistuje');
      return;
    }
    
    console.log('\n📊 Aktuálne skóre z cache:');
    console.log(`Health Score: ${ticker.analysisCache?.healthScore || 'N/A'}`);
    console.log(`Profitability Score: ${ticker.analysisCache?.profitabilityScore || 'N/A'}`);
    console.log(`Valuation Score: ${ticker.analysisCache?.valuationScore || 'N/A'}`);
    
    const latestStmt = ticker.financialStatements[0];
    const prevStmt = ticker.financialStatements[1];
    
    if (latestStmt) {
      console.log('\n💰 Finančné údaje (posledný štvrťrok):');
      console.log(`Revenue: $${(latestStmt.revenue / 1e9).toFixed(2)}B`);
      console.log(`Net Income: $${(latestStmt.netIncome / 1e9).toFixed(2)}B`);
      console.log(`EBIT: $${(latestStmt.ebit / 1e9).toFixed(2)}B`);
      console.log(`Total Equity: $${(latestStmt.totalEquity / 1e9).toFixed(2)}B`);
      console.log(`Total Assets: $${(latestStmt.totalAssets / 1e9).toFixed(2)}B`);
      console.log(`Total Liabilities: $${(latestStmt.totalLiabilities / 1e9).toFixed(2)}B`);
      console.log(`Current Assets: $${(latestStmt.currentAssets / 1e9).toFixed(2)}B`);
      console.log(`Current Liabilities: $${(latestStmt.currentLiabilities / 1e9).toFixed(2)}B`);
      console.log(`Retained Earnings: $${(latestStmt.retainedEarnings / 1e9).toFixed(2)}B`);
      
      // Ručný výpočet Health Score
      console.log('\n🏥 Ručný výpočet Health Score:');
      let healthScore = 50;
      
      // Altman Z
      if (ticker.analysisCache?.altmanZ) {
        const altmanZ = ticker.analysisCache.altmanZ;
        console.log(`   Altman Z: ${altmanZ.toFixed(2)}`);
        if (altmanZ > 3.0) {
          healthScore += 30;
          console.log(`   +30 (Altman Z > 3.0)`);
        } else if (altmanZ < 1.8) {
          healthScore -= 30;
          console.log(`   -30 (Altman Z < 1.8)`);
        } else {
          console.log(`   +0 (1.8 <= Altman Z <= 3.0)`);
        }
      }
      
      // Debt Repayment
      if (ticker.analysisCache?.debtRepaymentYears) {
        const debtYears = ticker.analysisCache.debtRepaymentYears;
        console.log(`   Debt Repayment: ${debtYears.toFixed(1)} years`);
        if (debtYears < 3) {
          healthScore += 20;
          console.log(`   +20 (Debt < 3 years)`);
        } else if (debtYears > 10) {
          healthScore -= 20;
          console.log(`   -20 (Debt > 10 years)`);
        } else {
          console.log(`   +0 (3 <= Debt <= 10 years)`);
        }
      }
      
      healthScore = Math.max(0, Math.min(100, healthScore));
      console.log(`   Health Score: ${healthScore} (vs cache: ${ticker.analysisCache?.healthScore})`);
      
      // Ručný výpočet Profitability Score
      console.log('\n💰 Ručný výpočet Profitability Score:');
      let profitabilityScore = 50;
      
      if (latestStmt.revenue && latestStmt.revenue > 0) {
        // Net Margin
        const netMargin = (latestStmt.netIncome || 0) / latestStmt.revenue;
        console.log(`   Net Margin: ${(netMargin * 100).toFixed(2)}%`);
        if (netMargin > 0.15) {
          profitabilityScore += 15;
          console.log(`   +15 (Net Margin > 15%)`);
        } else if (netMargin < 0) {
          profitabilityScore -= 15;
          console.log(`   -15 (Net Margin < 0%)`);
        } else {
          console.log(`   +0 (0% <= Net Margin <= 15%)`);
        }
        
        // Operating Margin Change
        if (latestStmt.ebit && prevStmt?.revenue && prevStmt.ebit) {
          const currentOpMargin = latestStmt.ebit / latestStmt.revenue;
          const prevOpMargin = prevStmt.ebit / prevStmt.revenue;
          console.log(`   Op Margin: ${(currentOpMargin * 100).toFixed(2)}% (prev: ${(prevOpMargin * 100).toFixed(2)}%)`);
          if (currentOpMargin > prevOpMargin) {
            profitabilityScore += 10;
            console.log(`   +10 (Op Margin improved)`);
          } else {
            profitabilityScore -= 10;
            console.log(`   -10 (Op Margin declined)`);
          }
        }
        
        // ROE
        if (latestStmt.totalEquity && latestStmt.totalEquity > 0) {
          const roe = (latestStmt.netIncome || 0) / latestStmt.totalEquity;
          console.log(`   ROE: ${(roe * 100).toFixed(2)}%`);
          if (roe > 0.15) {
            profitabilityScore += 15;
            console.log(`   +15 (ROE > 15%)`);
          } else if (roe < 0.05) {
            profitabilityScore -= 10;
            console.log(`   -10 (ROE < 5%)`);
          } else {
            console.log(`   +0 (5% <= ROE <= 15%)`);
          }
        }
        
        profitabilityScore = Math.max(0, Math.min(100, Math.round(profitabilityScore)));
        console.log(`   Profitability Score: ${profitabilityScore} (vs cache: ${ticker.analysisCache?.profitabilityScore})`);
      }
      
      // Valuation Score - zjednodušený výpočet
      console.log('\n💎 Valuation Score (zjednodušený výpočet):');
      let valuationScore = 50;
      console.log(`   Základné: 50`);
      console.log(`   Valuation Score: ${valuationScore} (vs cache: ${ticker.analysisCache?.valuationScore})`);
      console.log('   Poznámka: Valuation Score závisí od P/E percentile a FCF yield, ktoré vyžadujú viac dát');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeScores();
