import { NextRequest, NextResponse } from 'next/server';
import { checkEarningsForOurTickers } from '@/lib/clients/yahooFinanceScraper';
import { prisma } from '@/lib/db/prisma';
import { DEFAULT_TICKERS } from '@/data/defaultTickers';
import { verifyCronAuth } from '@/lib/utils/cronAuth';

// Move Prisma Client inside functions to avoid build-time issues
// let prisma: any = null;

// function getPrismaClient() {
//   if (!prisma) {
//     try {
//       const { PrismaClient } = require('@prisma/client');
//       prisma = new PrismaClient();
//     } catch (error) {
//       console.error('❌ Prisma Client not available:', error);
//       return null;
//     }
//   }
//   return prisma;
// }

interface EarningsData {
  ticker: string;
  companyName: string;
  time: string; // "before" or "after"
  epsEstimate?: number;
  epsActual?: number;
  revenueEstimate?: number;
  revenueActual?: number;
}

/**
 * Získa kompletný zoznam tickerov zo všetkých tierov
 */
function getAllTickers(): string[] {
  const allTickers = new Set<string>();

  // Pridaj všetky tickery zo všetkých tierov
  (Object.values(DEFAULT_TICKERS) as string[][]).forEach((tier: string[]) => {
    tier.forEach(ticker => allTickers.add(ticker));
  });

  return Array.from(allTickers);
}

/**
 * Vyčistí earnings calendar pre daný dátum
 */
async function clearEarningsCalendar(date: string): Promise<void> {
  const prismaClient = prisma;
  if (!prismaClient) {
    console.log('⚠️ Prisma not available, skipping database clear');
    return;
  }

  try {
    const deleteCount = await prismaClient.earningsCalendar.deleteMany({
      where: {
        date: {
          gte: new Date(date + 'T00:00:00Z'),
          lt: new Date(date + 'T23:59:59Z')
        }
      }
    });

    console.log(`🗑️ Cleared ${deleteCount.count} earnings records for ${date}`);
  } catch (error) {
    console.error('❌ Error clearing earnings calendar:', error);
  }
}

/**
 * Uloží earnings data do databázy
 */
async function saveEarningsToDatabase(earningsData: EarningsData[], date: string): Promise<void> {
  const prismaClient = prisma;
  if (!prismaClient) {
    console.log('⚠️ Prisma not available, skipping database save');
    return;
  }

  try {
    const records = earningsData.map(earning => ({
      ticker: earning.ticker,
      companyName: earning.companyName,
      date: new Date(date + 'T00:00:00Z'),
      time: earning.time,
      epsEstimate: earning.epsEstimate || null,
      epsActual: earning.epsActual || null,
      revenueEstimate: earning.revenueEstimate || null,
      revenueActual: earning.revenueActual || null
    }));

    // Použij upsert pre každý záznam
    for (const record of records) {
      try {
        await prismaClient.earningsCalendar.create({
          data: record
        });
      } catch (error) {
        // If record exists, update it
        await prismaClient.earningsCalendar.updateMany({
          where: {
            ticker: record.ticker,
            date: record.date
          },
          data: record
        });
      }
    }

    console.log(`✅ Saved ${records.length} earnings records to database for ${date}`);
  } catch (error) {
    console.error('❌ Error saving earnings to database:', error);
    throw error;
  }
}

/**
 * Získa earnings data z Yahoo Finance pre daný dátum
 */
async function fetchEarningsFromYahoo(date: string): Promise<EarningsData[]> {
  try {
    console.log(`🔍 Fetching earnings data from Yahoo Finance for ${date}...`);

    // Získaj všetky tickery
    const allTickers = getAllTickers();
    console.log(`📊 Total tickers to check: ${allTickers.length}`);

    // Použij náš Yahoo Finance scraper
    const yahooResult = await checkEarningsForOurTickers(date, 'all');

    if (yahooResult.totalFound === 0) {
      console.log(`⚠️ No earnings found for ${date}`);
      return [];
    }

    // Konvertuj výsledky do formátu pre databázu
    const earningsData: EarningsData[] = [];

    // Pre-market earnings (string array)
    if (yahooResult.preMarket && yahooResult.preMarket.length > 0) {
      yahooResult.preMarket.forEach(ticker => {
        earningsData.push({
          ticker: ticker,
          companyName: ticker, // Budeme aktualizovať neskôr z Polygon API
          time: 'before'
          // Optional properties omitted (exactOptionalPropertyTypes: true)
        });
      });
    }

    // After-market earnings (string array)
    if (yahooResult.afterMarket && yahooResult.afterMarket.length > 0) {
      yahooResult.afterMarket.forEach(ticker => {
        earningsData.push({
          ticker: ticker,
          companyName: ticker, // Budeme aktualizovať neskôr z Polygon API
          time: 'after'
          // Optional properties omitted (exactOptionalPropertyTypes: true)
        });
      });
    }

    console.log(`✅ Found ${earningsData.length} earnings records for ${date}`);
    return earningsData;

  } catch (error) {
    console.error('❌ Error fetching earnings from Yahoo Finance:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    console.log(`🚀 Starting daily earnings calendar update for extended range (-3 to +7 days)`);
    let totalProcessed = 0;
    const today = new Date();

    for (let i = -3; i <= 7; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);
      const dateStr = targetDate.toISOString().split('T')[0];
      
      if (!dateStr) continue;
      
      console.log(`\n--- Processing date: ${dateStr} ---`);
      
      // 1. Vyčisti existujúce záznamy pre tento dátum
      await clearEarningsCalendar(dateStr);

      // 2. Získaj earnings data z Yahoo Finance
      const earningsData = await fetchEarningsFromYahoo(dateStr);

      // 3. Ulož do databázy
      if (earningsData.length > 0) {
        await saveEarningsToDatabase(earningsData, dateStr);
        totalProcessed += earningsData.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Earnings calendar updated for extended range`,
      recordsProcessed: totalProcessed
    });

  } catch (error) {
    console.error('❌ Error in earnings calendar cron job:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// GET endpoint pre manuálne spustenie (testing)
export async function GET(request: NextRequest) {
  try {
    console.log(`🔧 Manual earnings calendar update for extended range (-3 to +7 days)`);
    let totalProcessed = 0;
    const today = new Date();

    for (let i = -3; i <= 7; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);
      const dateStr = targetDate.toISOString().split('T')[0];
      
      if (!dateStr) continue;

      // 1. Vyčisti existujúce záznamy
      await clearEarningsCalendar(dateStr);

      // 2. Získaj earnings data
      const earningsData = await fetchEarningsFromYahoo(dateStr);

      // 3. Ulož do databázy
      if (earningsData.length > 0) {
        await saveEarningsToDatabase(earningsData, dateStr);
        totalProcessed += earningsData.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Manual earnings calendar update completed for extended range`,
      recordsProcessed: totalProcessed
    });

  } catch (error) {
    console.error('❌ Error in manual earnings calendar update:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
} 