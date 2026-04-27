#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addTSLA() {
  try {
    console.log('🔍 Pridávam TSLA do databázy...');
    
    // Skontroluj, či TSLA už existuje
    const existing = await prisma.ticker.findUnique({
      where: { symbol: 'TSLA' }
    });
    
    if (existing) {
      console.log('✅ TSLA už existuje v databáze');
      return;
    }
    
    // Pridaj TSLA s základnými údajmi
    const tsla = await prisma.ticker.create({
      data: {
        symbol: 'TSLA',
        name: 'Tesla, Inc.',
        sector: 'Consumer Cyclical',
        industry: 'Auto Manufacturers',
        lastPrice: 242.84, // Aktuálna cena
        lastMarketCap: 772000000000, // ~$772B
        sharesOutstanding: 3175000000, // ~3.175B shares
        lastPriceUpdated: new Date()
      }
    });
    
    console.log('✅ TSLA pridaný do databázy:', tsla);
    
    // Pridaj aj fin. výkazy (mock dáta pre testovanie)
    await prisma.financialStatement.create({
      data: {
        symbol: 'TSLA',
        period: 'Q4',
        endDate: new Date('2024-12-31'),
        fiscalYear: 2024,
        fiscalPeriod: 'Q4',
        revenue: 97700000000, // $97.7B
        netIncome: 12900000000, // $12.9B
        ebit: 15800000000, // $15.8B
        operatingCashFlow: 13100000000, // $13.1B
        capex: -4400000000, // -$4.4B (negative = investment)
        totalAssets: 133000000000, // $133B
        totalLiabilities: 43000000000, // $43B
        currentAssets: 38000000000, // $38B
        currentLiabilities: 23000000000, // $23B
        retainedEarnings: 15000000000, // $15B
        totalEquity: 77000000000, // $77B
        sharesOutstanding: 3175000000
      }
    });
    
    console.log('✅ TSLA finančné výkazy pridané');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addTSLA();
