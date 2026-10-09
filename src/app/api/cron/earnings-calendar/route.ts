import { NextRequest, NextResponse } from 'next/server';
import { serverLog } from '@/lib/utils/serverLog';
import { checkEarningsForOurTickers } from '@/lib/clients/yahooFinanceScraper';
import { prisma } from '@/lib/db/prisma';
import { verifyCronAuth, verifyCronAuthOptional, withCronLock } from '@/lib/utils/cronAuth';

const FINNHUB_KEY = process.env.FINNHUB_TOKEN;

interface EarningsData {
  ticker: string;
  companyName: string;
  time: string; // 'bmo' | 'amc' | 'dmh' | 'tbd'
  epsEstimate?: number | undefined;
  epsActual?: number | undefined;
  revenueEstimate?: number | undefined;
  revenueActual?: number | undefined;
  epsSurprisePercent?: number | undefined;
  revenueSurprisePercent?: number | undefined;
}

/**
 * Atomicky nahradí earnings dáta pre daný dátum (delete + insert v transakcii).
 */
async function replaceEarningsForDate(earningsData: EarningsData[], date: string): Promise<void> {
  const records = earningsData.map(earning => ({
    ticker: earning.ticker,
    companyName: earning.companyName,
    date: new Date(date + 'T00:00:00Z'),
    time: earning.time,
    epsEstimate: earning.epsEstimate || null,
    epsActual: earning.epsActual || null,
    revenueEstimate: earning.revenueEstimate || null,
    revenueActual: earning.revenueActual || null,
    epsSurprisePercent: earning.epsSurprisePercent || null,
    revenueSurprisePercent: earning.revenueSurprisePercent || null
  }));

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.earningsCalendar.deleteMany({
      where: {
        date: {
          gte: new Date(date + 'T00:00:00Z'),
          lt: new Date(date + 'T24:00:00Z')
        }
      }
    });
    await tx.earningsCalendar.createMany({ data: records });
    serverLog(`✅ Replaced ${deleted.count} → ${records.length} earnings records for ${date}`);
  });
}

/**
 * Získa earnings data z Finnhub pre daný dátum (ALL tickers, nielen DEFAULT_TICKERS)
 */
async function fetchEarningsFromFinnhub(date: string): Promise<EarningsData[]> {
  if (!FINNHUB_KEY) {
    serverLog('⚠️ FINNHUB_TOKEN is not set, skipping Finnhub fetch');
    return [];
  }
  try {
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&token=${FINNHUB_KEY}`;
    const res = await fetch(url, { next: { revalidate: 0 } });

    if (!res.ok) {
      console.warn(`⚠️ Finnhub API returned ${res.status} for ${date}`);
      return [];
    }

    const data = await res.json();
    const earningsCalendar = data.earningsCalendar ?? [];

    const earningsData: EarningsData[] = earningsCalendar.map((e: any) => {
      let epsSurprisePercent: number | undefined = undefined;
      if (e.epsActual != null && e.epsEstimate != null && e.epsEstimate !== 0) {
        epsSurprisePercent = ((e.epsActual - e.epsEstimate) / Math.abs(e.epsEstimate)) * 100;
      }
      let revenueSurprisePercent: number | undefined = undefined;
      if (e.revenueActual != null && e.revenueEstimate != null && e.revenueEstimate !== 0) {
        revenueSurprisePercent = ((e.revenueActual - e.revenueEstimate) / Math.abs(e.revenueEstimate)) * 100;
      }
      return {
        ticker: e.symbol,
        companyName: e.company ?? e.symbol,
        time: e.hour === 'bmo' ? 'bmo' : e.hour === 'amc' ? 'amc' : e.hour === 'dmh' ? 'dmh' : 'tbd',
        epsEstimate: e.epsEstimate ?? undefined,
        epsActual: e.epsActual ?? undefined,
        revenueEstimate: e.revenueEstimate ?? undefined,
        revenueActual: e.revenueActual ?? undefined,
        epsSurprisePercent,
        revenueSurprisePercent,
      };
    });

    serverLog(`✅ Finnhub: Found ${earningsData.length} earnings records for ${date}`);
    return earningsData;
  } catch (error) {
    console.error(`❌ Error fetching from Finnhub for ${date}:`, error);
    return [];
  }
}

/**
 * Získa earnings data z Yahoo Finance / Finnhub pre daný dátum
 */
async function fetchEarningsFromYahoo(date: string): Promise<EarningsData[]> {
  try {
    serverLog(`🔍 Fetching earnings data for ${date}...`);

    const yahooResult = await checkEarningsForOurTickers(date, 'all');

    if (yahooResult.totalFound === 0) {
      serverLog(`⚠️ No earnings found for ${date}`);
      return [];
    }

    // Ak máme full items (s EPS dátami), použijeme ich
    if (yahooResult.items && yahooResult.items.length > 0) {
      const earningsData: EarningsData[] = yahooResult.items.map(item => {
        // Compute epsSurprisePercent if both estimate and actual are available
        // but Finnhub didn't return it
        let epsSurprisePercent = item.surprisePercent ?? undefined;
        if (epsSurprisePercent === undefined && item.epsEstimate != null && item.epsActual != null && item.epsEstimate !== 0) {
          epsSurprisePercent = ((item.epsActual - item.epsEstimate) / Math.abs(item.epsEstimate)) * 100;
        }
        // Compute revenueSurprisePercent similarly
        let revenueSurprisePercent: number | undefined = undefined;
        if (item.revenueEstimate != null && item.revenueActual != null && item.revenueEstimate !== 0) {
          revenueSurprisePercent = ((item.revenueActual - item.revenueEstimate) / Math.abs(item.revenueEstimate)) * 100;
        }
        return {
          ticker: item.ticker,
          companyName: item.companyName,
          time: item.time,
          epsEstimate: item.epsEstimate ?? undefined,
          epsActual: item.epsActual ?? undefined,
          revenueEstimate: item.revenueEstimate ?? undefined,
          revenueActual: item.revenueActual ?? undefined,
          epsSurprisePercent,
          revenueSurprisePercent,
        };
      });
      serverLog(`✅ Found ${earningsData.length} earnings records for ${date} (with EPS data)`);
      return earningsData;
    }

    // Fallback: iba ticker + time (starý formát)
    const earningsData: EarningsData[] = [];

    if (yahooResult.preMarket && yahooResult.preMarket.length > 0) {
      yahooResult.preMarket.forEach(ticker => {
        earningsData.push({
          ticker: ticker,
          companyName: ticker,
          time: 'bmo'
        });
      });
    }

    if (yahooResult.afterMarket && yahooResult.afterMarket.length > 0) {
      yahooResult.afterMarket.forEach(ticker => {
        earningsData.push({
          ticker: ticker,
          companyName: ticker,
          time: 'amc'
        });
      });
    }

    serverLog(`✅ Found ${earningsData.length} earnings records for ${date} (fallback, no EPS data)`);
    return earningsData;

  } catch (error) {
    console.error('❌ Error fetching earnings:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    // Distributed lock: prevent overlapping runs (11 days x Yahoo fetches)
    return await withCronLock('earnings-calendar', 30 * 60, async () => runEarningsCalendarUpdate(false));
  } catch (error) {
    console.error('❌ Error in earnings calendar cron job:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

async function runEarningsCalendarUpdate(manual: boolean): Promise<NextResponse> {
  try {
    serverLog(`${manual ? '🔧 Manual' : '🚀 Starting daily'} earnings calendar update for extended range (-3 to +7 days)`);
    let totalProcessed = 0;
    let finnhubRecordCount = 0;
    // ET-anchored day grid — raw `new Date()` iterates UTC days, which are
    // one day ahead of the US calendar during 20:00–24:00 ET.
    const { getDateET } = await import('@/lib/utils/dateET');
    const todayNoon = new Date(getDateET() + 'T12:00:00Z');

    for (let i = -3; i <= 7; i++) {
      const targetDate = new Date(todayNoon);
      targetDate.setUTCDate(todayNoon.getUTCDate() + i);
      const dateStr = targetDate.toISOString().split('T')[0];

      if (!dateStr) continue;

      serverLog(`\n--- Processing date: ${dateStr} ---`);

      // 1. Získaj earnings data z Finnhub (ALL tickers)
      const finnhubData = await fetchEarningsFromFinnhub(dateStr);

      // 3. Získaj earnings data z Yahoo Finance (naše tickery, možno viac detailov)
      const yahooData = await fetchEarningsFromYahoo(dateStr);

      // 4. Merge: Finnhub (all) + Yahoo (our tickers with more detail)
      const mergedMap = new Map<string, EarningsData>();
      for (const e of finnhubData) {
        mergedMap.set(e.ticker, e);
      }
      // Yahoo data overrides Finnhub for our tickers (more detail)
      for (const e of yahooData) {
        mergedMap.set(e.ticker, e);
      }

      const earningsData = Array.from(mergedMap.values());

      finnhubRecordCount += finnhubData.length;

      // 5. Ulož do databázy — write runs only when replacement data exists,
      // so a transient source outage can't wipe an already-populated day.
      if (earningsData.length > 0) {
        await replaceEarningsForDate(earningsData, dateStr);
        totalProcessed += earningsData.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Earnings calendar updated for extended range (-3 to +7 days)`,
      recordsProcessed: totalProcessed,
      finnhubRecords: finnhubRecordCount,
    });

  } catch (error) {
    console.error('❌ Error in earnings calendar cron job:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// GET endpoint pre manuálne spustenie (testing) — requires auth in production
export async function GET(request: NextRequest) {
  const authError = verifyCronAuthOptional(request, true);
  if (authError) return authError;

  try {
    return await POST(request);
  } catch (error) {
    console.error('❌ Error in manual earnings calendar update:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
} 
