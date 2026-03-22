#!/usr/bin/env node

/**
 * Data Validation Script
 * Skript na kontrolu databázovej logiky a výpočtových metrík
 *
 * Použitie:
 * npm run validate-data
 * alebo
 * node scripts/validate-data.js [tickers]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Testovacie tickers (ak nie sú zadané parametre)
const DEFAULT_TEST_TICKERS = ["AAPL", "MSFT", "GOOGL", "TSLA", "NVDA"];

// Farby pre výstup
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function log(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function logError(message) {
  log(`❌ ERROR: ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  WARNING: ${message}`, colors.yellow);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

/**
 * Validácia Altman Z-Score výpočtu
 */
function validateAltmanZ(stmt, marketCap) {
  const errors = [];

  if (!stmt.totalAssets || stmt.totalAssets <= 0) {
    errors.push("Total Assets chýba alebo je <= 0");
    return { valid: false, errors, altmanZ: null };
  }

  // A = (Current Assets - Current Liabilities) / Total Assets
  const A =
    ((stmt.currentAssets || 0) - (stmt.currentLiabilities || 0)) /
    stmt.totalAssets;

  // B = Retained Earnings / Total Assets
  const B = (stmt.retainedEarnings || 0) / stmt.totalAssets;

  // C = EBIT / Total Assets
  const C = (stmt.ebit || 0) / stmt.totalAssets;

  // D = Market Value of Equity / Total Liabilities
  const D =
    stmt.totalLiabilities && stmt.totalLiabilities > 0 && marketCap > 0
      ? marketCap / stmt.totalLiabilities
      : 0;

  // E = Sales / Total Assets
  const E = (stmt.revenue || 0) / stmt.totalAssets;

  // Altman Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E
  const altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;

  // Validácia hodnôt
  if (isNaN(altmanZ) || !isFinite(altmanZ)) {
    errors.push("Altman Z je NaN alebo Infinite");
  }

  if (Math.abs(A) > 10) errors.push("A ratio je extrémna (>10)");
  if (Math.abs(B) > 10) errors.push("B ratio je extrémna (>10)");
  if (Math.abs(C) > 10) errors.push("C ratio je extrémna (>10)");
  if (Math.abs(D) > 10) errors.push("D ratio je extrémna (>10)");
  if (Math.abs(E) > 10) errors.push("E ratio je extrémna (>10)");

  return {
    valid: errors.length === 0,
    errors,
    altmanZ,
    components: { A, B, C, D, E },
  };
}

/**
 * Validácia P/E ratio výpočtu
 */
function validatePERatio(price, netIncome, sharesOutstanding) {
  const errors = [];

  if (!price || price <= 0) {
    errors.push("Cena chýba alebo je <= 0");
    return { valid: false, errors, pe: null };
  }

  if (!netIncome || netIncome <= 0) {
    errors.push("Net Income chýba alebo je <= 0");
    return { valid: false, errors, pe: null };
  }

  if (!sharesOutstanding || sharesOutstanding <= 0) {
    errors.push("Shares Outstanding chýba alebo je <= 0");
    return { valid: false, errors, pe: null };
  }

  // EPS = Net Income / Shares Outstanding
  const eps = netIncome / sharesOutstanding;

  // P/E = Price / EPS
  const pe = price / eps;

  if (isNaN(pe) || !isFinite(pe)) {
    errors.push("P/E je NaN alebo Infinite");
  }

  if (pe < 0) errors.push("P/E je záporné");
  if (pe > 1000) errors.push("P/E je extrémne vysoké (>1000)");

  return {
    valid: errors.length === 0,
    errors,
    pe,
    eps,
  };
}

/**
 * Validácia Market Cap výpočtu
 */
function validateMarketCap(price, sharesOutstanding) {
  const errors = [];

  if (!price || price <= 0) {
    errors.push("Cena chýba alebo je <= 0");
    return { valid: false, errors, marketCap: null };
  }

  if (!sharesOutstanding || sharesOutstanding <= 0) {
    errors.push("Shares Outstanding chýba alebo je <= 0");
    return { valid: false, errors, marketCap: null };
  }

  const marketCap = price * sharesOutstanding;

  if (isNaN(marketCap) || !isFinite(marketCap)) {
    errors.push("Market Cap je NaN alebo Infinite");
  }

  if (marketCap < 1000000) errors.push("Market Cap je príliš nízky (<$1M)");
  if (marketCap > 10e12) errors.push("Market Cap je extrémne vysoký (>$10T)");

  return {
    valid: errors.length === 0,
    errors,
    marketCap,
  };
}

/**
 * Validácia FCF (Free Cash Flow) výpočtu
 */
function validateFCF(operatingCashFlow, capex) {
  const errors = [];

  if (operatingCashFlow === null || operatingCashFlow === undefined) {
    errors.push("Operating Cash Flow chýba");
    return { valid: false, errors, fcf: null };
  }

  if (capex === null || capex === undefined) {
    errors.push("Capex chýba");
    return { valid: false, errors, fcf: null };
  }

  // FCF = Operating Cash Flow - |Capex|
  const fcf = operatingCashFlow - Math.abs(capex);

  if (isNaN(fcf) || !isFinite(fcf)) {
    errors.push("FCF je NaN alebo Infinite");
  }

  // FCF môže byť záporné, to je OK
  if (Math.abs(fcf) > 100e9)
    errors.push("FCF je extrémne vysoký/low (>|$100B|)");

  return {
    valid: errors.length === 0,
    errors,
    fcf,
  };
}

/**
 * Validácia Piotroski F-Score
 */
function validatePiotroski(latestStmt, prevStmt) {
  const errors = [];
  let score = 0;

  if (!latestStmt || !prevStmt) {
    errors.push("Chýbajú údaje pre Piotroski F-Score");
    return { valid: false, errors, score: 0 };
  }

  const totalAssets = latestStmt.totalAssets || 1;
  const prevTotalAssets = prevStmt.totalAssets || 1;

  // 1. ROA > 0
  const roa = (latestStmt.netIncome || 0) / totalAssets;
  if (roa > 0) score++;

  // 2. CFO > 0
  if (latestStmt.operatingCashFlow && latestStmt.operatingCashFlow > 0) score++;

  // 3. ROA improvement
  const prevRoa = (prevStmt.netIncome || 0) / prevTotalAssets;
  if (roa > prevRoa) score++;

  // 4. CFO > ROA (quality of earnings)
  const cfo = (latestStmt.operatingCashFlow || 0) / totalAssets;
  if (cfo > roa) score++;

  // 5. Leverage decrease
  const leverage =
    latestStmt.totalDebt && totalAssets > 0
      ? latestStmt.totalDebt / totalAssets
      : 0;
  const prevLeverage =
    prevStmt.totalDebt && prevTotalAssets > 0
      ? prevStmt.totalDebt / prevTotalAssets
      : 0;
  if (leverage < prevLeverage) score++;

  // 6. Current ratio improvement
  const currRatio =
    latestStmt.currentAssets && latestStmt.currentLiabilities
      ? latestStmt.currentAssets / latestStmt.currentLiabilities
      : 0;
  const prevCurrRatio =
    prevStmt.currentAssets && prevStmt.currentLiabilities
      ? prevStmt.currentAssets / prevStmt.currentLiabilities
      : 0;
  if (currRatio > prevCurrRatio) score++;

  // 7. No new shares issued
  if ((latestStmt.sharesOutstanding || 0) <= (prevStmt.sharesOutstanding || 0))
    score++;

  // 8. Gross margin improvement
  const gm = latestStmt.revenue
    ? (latestStmt.grossProfit || 0) / latestStmt.revenue
    : 0;
  const prevGm = prevStmt.revenue
    ? (prevStmt.grossProfit || 0) / prevStmt.revenue
    : 0;
  if (gm > prevGm) score++;

  // 9. Asset turnover improvement
  const at = latestStmt.revenue ? latestStmt.revenue / totalAssets : 0;
  const prevAt = prevStmt.revenue ? prevStmt.revenue / prevTotalAssets : 0;
  if (at > prevAt) score++;

  if (score < 0 || score > 9) {
    errors.push("Piotroski F-Score je mimo rozsah 0-9");
  }

  return {
    valid: errors.length === 0,
    errors,
    score,
  };
}

/**
 * Hlavná validačná funkcia pre jeden ticker
 */
async function validateTicker(symbol) {
  log(`\n🔍 Validácia ${symbol}...`, colors.cyan);

  const results = {
    symbol,
    tickerData: null,
    financials: [],
    analysisCache: null,
    errors: [],
    warnings: [],
    validations: {},
  };

  try {
    // 1. Získaj ticker data
    const ticker = await prisma.ticker.findUnique({
      where: { symbol },
      include: {
        analysisCache: true,
        financialStatements: {
          orderBy: { endDate: "desc" },
          take: 8, // Posledné 2 roky quarterly
        },
      },
    });

    if (!ticker) {
      logError(`Ticker ${symbol} neexistuje v databáze`);
      return results;
    }

    results.tickerData = ticker;
    results.financials = ticker.financialStatements;
    results.analysisCache = ticker.analysisCache;

    // 2. Validácia základných dát
    logInfo("  📊 Kontrola základných dát...");

    const marketCapValidation = validateMarketCap(
      ticker.lastPrice,
      ticker.sharesOutstanding,
    );
    results.validations.marketCap = marketCapValidation;

    if (!marketCapValidation.valid) {
      results.errors.push(...marketCapValidation.errors);
      logError(`Market Cap: ${marketCapValidation.errors.join(", ")}`);
    } else {
      logSuccess(
        `Market Cap: $${(marketCapValidation.marketCap / 1e9).toFixed(2)}B`,
      );
    }

    // 3. Validácia finančných výkazov
    if (ticker.financialStatements.length > 0) {
      logInfo("  💰 Kontrola finančných výkazov...");

      const latestStmt = ticker.financialStatements[0];
      const prevStmt = ticker.financialStatements[1];

      // Altman Z-Score
      const altmanZValidation = validateAltmanZ(
        latestStmt,
        ticker.lastMarketCap,
      );
      results.validations.altmanZ = altmanZValidation;

      if (!altmanZValidation.valid) {
        results.errors.push(...altmanZValidation.errors);
        logError(`Altman Z: ${altmanZValidation.errors.join(", ")}`);
      } else {
        logSuccess(`Altman Z: ${altmanZValidation.altmanZ?.toFixed(2)}`);
      }

      // P/E Ratio
      const peValidation = validatePERatio(
        ticker.lastPrice,
        latestStmt.netIncome,
        latestStmt.sharesOutstanding,
      );
      results.validations.peRatio = peValidation;

      if (!peValidation.valid) {
        results.warnings.push(...peValidation.errors);
        logWarning(`P/E: ${peValidation.errors.join(", ")}`);
      } else {
        logSuccess(`P/E: ${peValidation.pe?.toFixed(2)}`);
      }

      // FCF
      const fcfValidation = validateFCF(
        latestStmt.operatingCashFlow,
        latestStmt.capex,
      );
      results.validations.fcf = fcfValidation;

      if (!fcfValidation.valid) {
        results.warnings.push(...fcfValidation.errors);
        logWarning(`FCF: ${fcfValidation.errors.join(", ")}`);
      } else {
        logSuccess(`FCF: $${(fcfValidation.fcf / 1e9).toFixed(2)}B`);
      }

      // Piotroski F-Score
      if (prevStmt) {
        const piotroskiValidation = validatePiotroski(latestStmt, prevStmt);
        results.validations.piotroski = piotroskiValidation;

        if (!piotroskiValidation.valid) {
          results.warnings.push(...piotroskiValidation.errors);
          logWarning(`Piotroski: ${piotroskiValidation.errors.join(", ")}`);
        } else {
          logSuccess(`Piotroski F-Score: ${piotroskiValidation.score}/9`);
        }
      }

      // 4. Porovnanie s cache
      if (ticker.analysisCache) {
        logInfo("  🗄️  Kontrola analysis cache...");
        const cache = ticker.analysisCache;

        // Porovnaj Altman Z
        if (altmanZValidation.altmanZ !== null && cache.altmanZ !== null) {
          const diff = Math.abs(altmanZValidation.altmanZ - cache.altmanZ);
          if (diff > 0.01) {
            results.warnings.push(
              `Altman Z mismatch: calculated=${altmanZValidation.altmanZ.toFixed(2)}, cached=${cache.altmanZ.toFixed(2)}`,
            );
            logWarning(`Altman Z mismatch: ${diff.toFixed(2)}`);
          } else {
            logSuccess("Altman Z v cache je správny");
          }
        }

        // Porovnaj Piotroski
        if (
          prevStmt &&
          piotroskiValidation.score !== null &&
          cache.piotroskiScore !== null
        ) {
          if (piotroskiValidation.score !== cache.piotroskiScore) {
            results.warnings.push(
              `Piotroski mismatch: calculated=${piotroskiValidation.score}, cached=${cache.piotroskiScore}`,
            );
            logWarning(`Piotroski mismatch`);
          } else {
            logSuccess("Piotroski v cache je správny");
          }
        }
      }
    } else {
      results.warnings.push("Žiadne finančné výkazy");
      logWarning("Žiadne finančné výkazy");
    }
  } catch (error) {
    results.errors.push(`Database error: ${error.message}`);
    logError(`Database error: ${error.message}`);
  }

  return results;
}

/**
 * Generovanie súhrnného reportu
 */
function generateSummary(allResults) {
  log("\n📈 SÚHRNÝ REPORT", colors.magenta);
  log("=".repeat(50), colors.magenta);

  const totalTickers = allResults.length;
  const tickersWithData = allResults.filter((r) => r.tickerData).length;
  const tickersWithFinancials = allResults.filter(
    (r) => r.financials.length > 0,
  ).length;
  const tickersWithCache = allResults.filter((r) => r.analysisCache).length;

  logInfo(`Celkovo testovaných tickerov: ${totalTickers}`);
  logInfo(
    `Tickerov s dátami: ${tickersWithData}/${totalTickers} (${((tickersWithData / totalTickers) * 100).toFixed(1)}%)`,
  );
  logInfo(
    `Tickerov s finančnými výkazmi: ${tickersWithFinancials}/${totalTickers} (${((tickersWithFinancials / totalTickers) * 100).toFixed(1)}%)`,
  );
  logInfo(
    `Tickerov s analysis cache: ${tickersWithCache}/${totalTickers} (${((tickersWithCache / totalTickers) * 100).toFixed(1)}%)`,
  );

  // Zoznam chýb
  const allErrors = allResults.flatMap((r) => r.errors);
  const allWarnings = allResults.flatMap((r) => r.warnings);

  if (allErrors.length > 0) {
    log(`\n❌ CELKOVÉ CHYBY (${allErrors.length}):`, colors.red);
    const errorCounts = {};
    allErrors.forEach((error) => {
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });
    Object.entries(errorCounts).forEach(([error, count]) => {
      log(`  ${error}: ${count}x`, colors.red);
    });
  }

  if (allWarnings.length > 0) {
    log(`\n⚠️  CELKOVÉ VAROVANIA (${allWarnings.length}):`, colors.yellow);
    const warningCounts = {};
    allWarnings.forEach((warning) => {
      warningCounts[warning] = (warningCounts[warning] || 0) + 1;
    });
    Object.entries(warningCounts).forEach(([warning, count]) => {
      log(`  ${warning}: ${count}x`, colors.yellow);
    });
  }

  if (allErrors.length === 0 && allWarnings.length === 0) {
    logSuccess("Žiadne chyby ani varovania! Všetko vyzerá v poriadku.");
  }
}

/**
 * Hlavná funkcia
 */
async function main() {
  console.log("DEBUG: Main function started");
  const args = process.argv.slice(2);
  const testTickers = args.length > 0 ? args : DEFAULT_TEST_TICKERS;

  log("🚀 Data Validation Script", colors.cyan);
  log("=".repeat(50), colors.cyan);
  logInfo(`Testujem tickery: ${testTickers.join(", ")}`);

  try {
    const results = [];

    for (const symbol of testTickers) {
      const result = await validateTicker(symbol);
      results.push(result);
    }

    generateSummary(results);

    // Export results to JSON
    const fs = await import("fs/promises");
    await fs.writeFile(
      "validation-results.json",
      JSON.stringify(results, null, 2),
    );
    logInfo("\n📄 Detailné výsledky uložené do validation-results.json");
  } catch (error) {
    logError(`Script error: ${error.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Spustiť skript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// Export functions for external use
export {
  validateTicker,
  validateAltmanZ,
  validatePERatio,
  validateMarketCap,
  validateFCF,
  validatePiotroski,
  main,
};
