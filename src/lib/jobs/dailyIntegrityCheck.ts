import fs from 'fs';
import path from 'path';

import { prisma } from '@/lib/db/prisma';
import { nowET, getDateET, createETDate } from '@/lib/utils/dateET';
import { detectSession, getLastTradingDay } from '@/lib/utils/timeUtils';
import { calculatePercentChange } from '@/lib/utils/priceResolver';
import { computeMarketCap, computeMarketCapDiff, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { fetchPreviousClosesBatchAndPersist } from '@/lib/utils/onDemandPrevClose';
import { validateSectorIndustry } from '@/lib/utils/sectorIndustryValidator';
import { getLogoCandidates } from '@/lib/utils/getLogoUrl';

export type IntegrityIssueCode =
  | 'missing_prev_close'
  | 'stale_prev_close_date'
  | 'incorrect_prev_close'
  | 'invalid_change_pct'
  | 'change_pct_mismatch'
  | 'missing_market_cap'
  | 'market_cap_mismatch'
  | 'missing_market_cap_diff'
  | 'market_cap_diff_mismatch'
  | 'missing_shares_outstanding'
  | 'missing_sector'
  | 'missing_industry'
  | 'invalid_sector_industry'
  | 'missing_logo'
  | 'stale_price';

export interface IntegrityIssue {
  code: IntegrityIssueCode;
  symbol: string;
  details?: string;
}

export interface DailyIntegrityOptions {
  /** Try to auto-fix missing prevClose/shares/logoUrl (safe, capped). */
  fix?: boolean;
  /** Maximum number of tickers to include in the returned sample lists per category. */
  maxSamplesPerIssue?: number;
  /** Max number of tickers to auto-fix prevClose in one run (caps Polygon usage). */
  fixPrevCloseMaxTickers?: number;
  /** Max number of tickers to auto-fix sharesOutstanding in one run (caps Polygon usage). */
  fixSharesMaxTickers?: number;
  /** Max number of tickers to auto-fix incorrect prevClose in one run (caps Polygon usage). */
  fixIncorrectPrevCloseMaxTickers?: number;
  /** Consider price stale if lastPriceUpdated older than this many hours. */
  stalePriceHours?: number;
  /** Enable verification of prevClose values against Polygon API (can be slow). */
  verifyPrevCloseValues?: boolean;
}

export interface DailyIntegritySummary {
  runAt: string;
  etDate: string;
  session: 'pre' | 'live' | 'after' | 'closed';
  expectedPrevCloseSource: 'calendar' | 'db_mode';
  expectedPrevCloseDateET: string; // YYYY-MM-DD
  expectedPrevCloseDateETCalendar: string; // YYYY-MM-DD (debug)
  totals: {
    tickers: number;
    tickersWithPrice: number;
    issues: number;
    uniqueSymbolsWithIssues: number;
  };
  byCode: Record<IntegrityIssueCode, { count: number; samples: string[] }>;
  fixes?: {
    prevCloseFixed: number;
    sharesFixed: number;
    logosFixed: number;
  };
}

function ensureByCode(base?: Partial<DailyIntegritySummary['byCode']>): DailyIntegritySummary['byCode'] {
  const codes: IntegrityIssueCode[] = [
    'missing_prev_close',
    'stale_prev_close_date',
    'incorrect_prev_close',
    'invalid_change_pct',
    'change_pct_mismatch',
    'missing_market_cap',
    'market_cap_mismatch',
    'missing_market_cap_diff',
    'market_cap_diff_mismatch',
    'missing_shares_outstanding',
    'missing_sector',
    'missing_industry',
    'invalid_sector_industry',
    'missing_logo',
    'stale_price'
  ];

  const out = {} as DailyIntegritySummary['byCode'];
  for (const c of codes) {
    out[c] = base?.[c] ?? { count: 0, samples: [] };
  }
  return out;
}

function addIssue(
  byCode: DailyIntegritySummary['byCode'],
  code: IntegrityIssueCode,
  symbol: string,
  maxSamples: number
) {
  byCode[code].count++;
  if (byCode[code].samples.length < maxSamples) {
    byCode[code].samples.push(symbol);
  }
}

function sameDay(a: Date | null, b: Date): boolean {
  if (!a) return false;
  return a.getTime() === b.getTime();
}

function approxEqual(a: number, b: number, absTol: number, relTol: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  const rel = Math.abs(b) > 0 ? diff / Math.abs(b) : diff;
  return diff <= absTol || rel <= relTol;
}

function getLocalLogoPath(symbol: string, size: 32 | 64 = 32): string {
  // The repo uses lower-case filenames, including dots (e.g. brk.a-32.webp).
  return path.join(process.cwd(), 'public', 'logos', `${symbol.toLowerCase()}-${size}.webp`);
}

export async function runDailyIntegrityCheck(
  options: DailyIntegrityOptions = {}
): Promise<DailyIntegritySummary> {
  const {
    fix = false,
    maxSamplesPerIssue = 15,
    fixPrevCloseMaxTickers = 150,
    fixSharesMaxTickers = 50,
    fixIncorrectPrevCloseMaxTickers = 100,
    stalePriceHours = 36,
    verifyPrevCloseValues = false
  } = options;

  const etNow = nowET();
  const etDate = getDateET(etNow);
  const session = detectSession(etNow);

  // Regular close map for TODAY ET (usually empty at ~05:00 ET, but harmless and keeps parity with app logic).
  const todayDateObj = createETDate(etDate);
  const dailyRefs = await prisma.dailyRef.findMany({
    where: { date: todayDateObj },
    select: { symbol: true, regularClose: true }
  });
  const regularCloseBySymbol = new Map<string, number>();
  dailyRefs.forEach(r => {
    if (r.regularClose && r.regularClose > 0) {
      regularCloseBySymbol.set(r.symbol, r.regularClose);
    }
  });

  const tickers = await prisma.ticker.findMany({
    select: {
      symbol: true,
      sector: true,
      industry: true,
      logoUrl: true,
      sharesOutstanding: true,
      latestPrevClose: true,
      latestPrevCloseDate: true,
      lastPrice: true,
      lastChangePct: true,
      lastMarketCap: true,
      lastMarketCapDiff: true,
      lastPriceUpdated: true
    },
    orderBy: { symbol: 'asc' }
  });

  const byCode = ensureByCode();
  const symbolsWithIssues = new Set<string>();
  const tickersWithPrice = tickers.filter(t => (t.lastPrice ?? 0) > 0);
  const incorrectPrevCloseSymbols: string[] = [];

  // Expected previous close trading day
  //
  // Primary: calendar (ET) via getLastTradingDay
  // Fallback: DB mode (most common latestPrevCloseDate across priced tickers)
  //
  // Why: we observed rare env-dependent drift on server (expected date jumping back multiple days).
  // This makes the check robust and also surfaces which source was used.
  const expectedPrevCloseDateCalendar = getLastTradingDay(createETDate(etDate));
  const expectedPrevCloseDateETCalendar = getDateET(expectedPrevCloseDateCalendar);

  const prevCloseDateCounts = new Map<string, number>();
  for (const t of tickers) {
    const price = t.lastPrice ?? 0;
    const prevClose = t.latestPrevClose ?? 0;
    const d = t.latestPrevCloseDate;
    if (price > 0 && prevClose > 0 && d) {
      const ymd = getDateET(d);
      prevCloseDateCounts.set(ymd, (prevCloseDateCounts.get(ymd) ?? 0) + 1);
    }
  }

  let expectedPrevCloseSource: DailyIntegritySummary['expectedPrevCloseSource'] = 'calendar';
  let expectedPrevCloseDateET = expectedPrevCloseDateETCalendar;
  let expectedPrevCloseDate = expectedPrevCloseDateCalendar;

  if (prevCloseDateCounts.size > 0) {
    let bestYMD = '';
    let bestCount = 0;
    for (const [ymd, count] of prevCloseDateCounts.entries()) {
      if (count > bestCount) {
        bestYMD = ymd;
        bestCount = count;
      }
    }

    // If DB-mode disagrees with calendar by >=2 days, trust DB-mode (more realistic than a calendar jump).
    if (bestYMD && bestYMD !== expectedPrevCloseDateETCalendar) {
      const calMs = createETDate(expectedPrevCloseDateETCalendar).getTime();
      const dbMs = createETDate(bestYMD).getTime();
      const dayDiff = Math.abs(calMs - dbMs) / (24 * 60 * 60 * 1000);

      if (dayDiff >= 2) {
        expectedPrevCloseSource = 'db_mode';
        expectedPrevCloseDateET = bestYMD;
        expectedPrevCloseDate = createETDate(bestYMD);
      }
    }
  }

  // Track candidates for safe auto-fix
  const missingPrevCloseSymbols: string[] = [];
  const missingSharesSymbols: Array<{ symbol: string; price: number }> = [];
  const missingLogoSymbols: string[] = [];

  const staleCutoffMs = stalePriceHours * 60 * 60 * 1000;
  const nowMs = Date.now();

  for (const t of tickers) {
    const symbol = t.symbol;
    const price = t.lastPrice ?? 0;
    const prevClose = t.latestPrevClose ?? 0;
    const shares = t.sharesOutstanding ?? 0;

    // A) previous close integrity (only required when we have a price)
    if (price > 0) {
      const hasPrevClose = prevClose > 0 && t.latestPrevCloseDate !== null;
      if (!hasPrevClose) {
        addIssue(byCode, 'missing_prev_close', symbol, maxSamplesPerIssue);
        symbolsWithIssues.add(symbol);
        missingPrevCloseSymbols.push(symbol);
      } else if (!sameDay(t.latestPrevCloseDate, expectedPrevCloseDate)) {
        addIssue(byCode, 'stale_prev_close_date', symbol, maxSamplesPerIssue);
        symbolsWithIssues.add(symbol);
      } else if (verifyPrevCloseValues && prevClose > 0) {
        // Verify prevClose value against Polygon API (optional, can be slow)
        // This check is skipped by default to avoid excessive API calls
        // Enable with verifyPrevCloseValues=true option
        try {
          const { getPreviousClose } = await import('@/lib/utils/marketCapUtils');
          const correctPrevClose = await getPreviousClose(symbol);
          if (correctPrevClose && correctPrevClose > 0) {
            const diff = Math.abs(prevClose - correctPrevClose);
            if (diff > 0.01) { // More than 1 cent difference
              addIssue(byCode, 'incorrect_prev_close', symbol, maxSamplesPerIssue);
              symbolsWithIssues.add(symbol);
              incorrectPrevCloseSymbols.push(symbol);
            }
          }
        } catch (error) {
          // Silently skip if API call fails (rate limiting, network issues, etc.)
          // This is a best-effort check
        }
      }
    }

    // B) change % sanity (only when we have price + prevClose)
    if (price > 0 && prevClose > 0) {
      const regularClose = regularCloseBySymbol.get(symbol) || 0;
      const pct = calculatePercentChange(
        price,
        session,
        prevClose > 0 ? prevClose : null,
        regularClose > 0 ? regularClose : null
      ).changePct;

      if (!Number.isFinite(pct)) {
        addIssue(byCode, 'invalid_change_pct', symbol, maxSamplesPerIssue);
        symbolsWithIssues.add(symbol);
      }

      // Compare with stored lastChangePct if present (best-effort; stored value can lag).
      const stored = t.lastChangePct ?? null;
      if (stored !== null && Number.isFinite(stored)) {
        // Allow minor drift/rounding; bigger deltas usually indicate stale prevClose or wrong reference.
        if (!approxEqual(stored, pct, 0.25, 0.02)) {
          addIssue(byCode, 'change_pct_mismatch', symbol, maxSamplesPerIssue);
          symbolsWithIssues.add(symbol);
        }
      }
    }

    // C) market cap integrity
    if (price > 0) {
      if (!shares || shares <= 0) {
        addIssue(byCode, 'missing_shares_outstanding', symbol, maxSamplesPerIssue);
        symbolsWithIssues.add(symbol);
        // Only consider for auto-fix when we have prevClose too (limits to “real” tickers).
        if (prevClose > 0) {
          missingSharesSymbols.push({ symbol, price });
        }
      }

      const computedCap = shares > 0 ? computeMarketCap(price, shares) : 0;
      const storedCap = t.lastMarketCap ?? 0;
      if (shares > 0 && computedCap > 0 && storedCap <= 0) {
        addIssue(byCode, 'missing_market_cap', symbol, maxSamplesPerIssue);
        symbolsWithIssues.add(symbol);
      } else if (shares > 0 && computedCap > 0 && storedCap > 0) {
        // Absolute tol 1.0B or 2% relative (stored is rounded to 2 decimals).
        if (!approxEqual(storedCap, computedCap, 1.0, 0.02)) {
          addIssue(byCode, 'market_cap_mismatch', symbol, maxSamplesPerIssue);
          symbolsWithIssues.add(symbol);
        }
      }

      const computedDiff = (shares > 0 && prevClose > 0) ? computeMarketCapDiff(price, prevClose, shares) : 0;
      const storedDiff = t.lastMarketCapDiff ?? 0;
      if (shares > 0 && prevClose > 0 && computedDiff !== 0 && storedDiff === 0) {
        addIssue(byCode, 'missing_market_cap_diff', symbol, maxSamplesPerIssue);
        symbolsWithIssues.add(symbol);
      } else if (shares > 0 && prevClose > 0 && computedDiff !== 0 && storedDiff !== 0) {
        // Absolute tol 1.0B or 5% relative (diff is noisier and can be clamped).
        if (!approxEqual(storedDiff, computedDiff, 1.0, 0.05)) {
          addIssue(byCode, 'market_cap_diff_mismatch', symbol, maxSamplesPerIssue);
          symbolsWithIssues.add(symbol);
        }
      }
    }

    // D) metadata integrity (sector/industry)
    const sector = (t.sector || '').trim();
    const industry = (t.industry || '').trim();
    if (!sector) {
      addIssue(byCode, 'missing_sector', symbol, maxSamplesPerIssue);
      symbolsWithIssues.add(symbol);
    }
    if (!industry) {
      addIssue(byCode, 'missing_industry', symbol, maxSamplesPerIssue);
      symbolsWithIssues.add(symbol);
    }
    if (sector && industry && !validateSectorIndustry(sector, industry)) {
      addIssue(byCode, 'invalid_sector_industry', symbol, maxSamplesPerIssue);
      symbolsWithIssues.add(symbol);
    }

    // E) logo integrity: accept either explicit logoUrl OR local static logo file.
    const hasLogoUrl = !!(t.logoUrl && t.logoUrl.trim().length > 0);
    const local32 = getLocalLogoPath(symbol, 32);
    const local64 = getLocalLogoPath(symbol, 64);
    const hasLocal = fs.existsSync(local32) || fs.existsSync(local64);
    if (!hasLogoUrl && !hasLocal) {
      addIssue(byCode, 'missing_logo', symbol, maxSamplesPerIssue);
      symbolsWithIssues.add(symbol);
      missingLogoSymbols.push(symbol);
    }

    // F) stale price: detect if lastPriceUpdated is too old (this usually indicates ingestion gaps)
    if (price > 0 && t.lastPriceUpdated) {
      const ageMs = nowMs - t.lastPriceUpdated.getTime();
      if (ageMs > staleCutoffMs) {
        addIssue(byCode, 'stale_price', symbol, maxSamplesPerIssue);
        symbolsWithIssues.add(symbol);
      }
    }
  }

  let fixes: DailyIntegritySummary['fixes'] | undefined;
  if (fix) {
    fixes = { prevCloseFixed: 0, sharesFixed: 0, logosFixed: 0 };

    // 1) Fix missing prevClose (API-safe batch)
    const prevCloseToFix = Array.from(new Set(missingPrevCloseSymbols)).slice(0, fixPrevCloseMaxTickers);
    if (prevCloseToFix.length > 0) {
      const today = getDateET(etNow);
      const result = await fetchPreviousClosesBatchAndPersist(prevCloseToFix, today, {
        maxTickers: fixPrevCloseMaxTickers,
        timeoutBudget: 30_000,
        maxConcurrent: 5
      });
      fixes.prevCloseFixed = result.size;
    }

    // 1b) Fix incorrect prevClose values (compare with Polygon API and update)
    const incorrectPrevCloseToFix = Array.from(new Set(incorrectPrevCloseSymbols)).slice(0, fixIncorrectPrevCloseMaxTickers);
    if (incorrectPrevCloseToFix.length > 0) {
      const { getPreviousClose } = await import('@/lib/utils/marketCapUtils');
      const { setPrevClose } = await import('@/lib/redis/operations');
      const lastTradingDay = getLastTradingDay(createETDate(etDate));
      const todayStr = getDateET(etNow);
      
      let fixedCount = 0;
      const maxConcurrent = 3; // Conservative to avoid rate limiting
      
      for (let i = 0; i < incorrectPrevCloseToFix.length; i += maxConcurrent) {
        const batch = incorrectPrevCloseToFix.slice(i, i + maxConcurrent);
        const batchResults = await Promise.allSettled(
          batch.map(async (symbol) => {
            try {
              const correctPrevClose = await getPreviousClose(symbol);
              if (correctPrevClose && correctPrevClose > 0) {
                // Update Ticker table
                await prisma.ticker.update({
                  where: { symbol },
                  data: {
                    latestPrevClose: correctPrevClose,
                    latestPrevCloseDate: lastTradingDay,
                    updatedAt: new Date()
                  }
                });

                // Update DailyRef table
                await prisma.dailyRef.upsert({
                  where: {
                    symbol_date: {
                      symbol,
                      date: lastTradingDay
                    }
                  },
                  update: {
                    previousClose: correctPrevClose,
                    updatedAt: new Date()
                  },
                  create: {
                    symbol,
                    date: lastTradingDay,
                    previousClose: correctPrevClose
                  }
                });

                // Update Redis cache
                try {
                  await setPrevClose(todayStr, symbol, correctPrevClose);
                } catch (error) {
                  // Non-fatal
                }

                return true;
              }
              return false;
            } catch (error) {
              console.warn(`Failed to fix incorrect prevClose for ${symbol}:`, error);
              return false;
            }
          })
        );
        
        fixedCount += batchResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
        
        // Rate limiting: small delay between batches
        if (i + maxConcurrent < incorrectPrevCloseToFix.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      fixes.prevCloseFixed += fixedCount;
    }

    // 2) Fix missing sharesOutstanding (capped, concurrent)
    const sharesToFix = missingSharesSymbols.slice(0, fixSharesMaxTickers);
    if (sharesToFix.length > 0) {
      const maxConcurrent = 3;
      for (let i = 0; i < sharesToFix.length; i += maxConcurrent) {
        const batch = sharesToFix.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(batch.map(async ({ symbol, price }) => {
          try {
            const shares = await getSharesOutstanding(symbol, price);
            if (shares > 0) {
              await prisma.ticker.update({
                where: { symbol },
                data: { sharesOutstanding: shares, updatedAt: new Date() }
              });
              return true;
            }
            return false;
          } catch {
            return false;
          }
        }));
        fixes.sharesFixed += batchResults.filter(Boolean).length;
      }
    }

    // 3) Fix missing logos (store a safe URL candidate, no outbound request is made here)
    const logosToFix = Array.from(new Set(missingLogoSymbols)).slice(0, 200);
    if (logosToFix.length > 0) {
      for (const symbol of logosToFix) {
        const candidates = getLogoCandidates(symbol, 32);
        const chosen = candidates[candidates.length - 1] || ''; // safest: ui-avatars fallback
        if (chosen) {
          await prisma.ticker.update({
            where: { symbol },
            data: { logoUrl: chosen, updatedAt: new Date() }
          });
          fixes.logosFixed++;
        }
      }
    }
  }

  const totalIssues = (Object.values(byCode) as Array<{ count: number }>).reduce((sum, v) => sum + v.count, 0);

  const summary: DailyIntegritySummary = {
    runAt: new Date().toISOString(),
    etDate,
    session,
    expectedPrevCloseSource,
    expectedPrevCloseDateET,
    expectedPrevCloseDateETCalendar,
    totals: {
      tickers: tickers.length,
      tickersWithPrice: tickersWithPrice.length,
      issues: totalIssues,
      uniqueSymbolsWithIssues: symbolsWithIssues.size
    },
    byCode
  };

  // exactOptionalPropertyTypes: only include when defined
  if (fixes) {
    summary.fixes = fixes;
  }

  return summary;
}

