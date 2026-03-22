#!/usr/bin/env node

/**
 * Re-calculate Analysis Cache Script
 * Prepočítanie všetkých analytických metrík po oprave Altman Z
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Import analysis functions directly (copied to avoid TS compilation issues)
function validateAltmanZ(stmt, price, sharesOutstanding) {
  const errors = [];

  if (!stmt.totalAssets || stmt.totalAssets <= 0) {
    errors.push("Total Assets chýba alebo je <= 0");
    return { valid: false, errors, altmanZ: null };
  }

  // Správny výpočet Market Value of Equity = Shares Outstanding × Current Price
  const marketValueOfEquity =
    sharesOutstanding && sharesOutstanding > 0 && price && price > 0
      ? sharesOutstanding * price
      : null;

  if (!marketValueOfEquity) {
    errors.push("Market Value of Equity sa nedá vypočítať");
    return { valid: false, errors, altmanZ: null };
  }

  const A =
    ((stmt.currentAssets || 0) - (stmt.currentLiabilities || 0)) /
    stmt.totalAssets;
  const B = (stmt.retainedEarnings || 0) / stmt.totalAssets;
  const C = (stmt.ebit || 0) / stmt.totalAssets;
  const D =
    stmt.totalLiabilities &&
    stmt.totalLiabilities > 0 &&
    marketValueOfEquity > 0
      ? marketValueOfEquity / stmt.totalLiabilities
      : 0;
  const E = (stmt.revenue || 0) / stmt.totalAssets;

  const altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;

  if (isNaN(altmanZ) || !isFinite(altmanZ)) {
    errors.push("Altman Z je NaN alebo Infinite");
  }

  return {
    valid: errors.length === 0,
    errors,
    altmanZ,
    components: { A, B, C, D, E },
  };
}

async function recalculateAllAnalysis() {
  try {
    console.log(" Prepočítavam analysis cache pre všetky tickery...");

    // Získaj všetky tickery s finančnými výkazmi
    const tickers = await prisma.ticker.findMany({
      where: {
        financialStatements: {
          some: {},
        },
      },
      include: {
        financialStatements: {
          orderBy: { endDate: "desc" },
          take: 8,
        },
        analysisCache: true,
      },
    });

    console.log(`📊 Nájdených ${tickers.length} tickerov s finančnými výkazmi`);

    const results = {
      success: 0,
      failed: 0,
      errors: [],
      altmanZFixes: 0,
    };

    for (const ticker of tickers) {
      try {
        console.log(`🔍 Spracujem ${ticker.symbol}...`);

        const latestStmt = ticker.financialStatements[0];
        if (!latestStmt) {
          console.log(`⚠️  ${ticker.symbol} - žiadne finančné výkazy`);
          continue;
        }

        // Prepočítaj Altman Z
        const altmanZValidation = validateAltmanZ(
          latestStmt,
          ticker.lastPrice,
          ticker.sharesOutstanding,
        );

        if (altmanZValidation.valid && altmanZValidation.altmanZ !== null) {
          // Aktualizuj analysis cache
          const updateData = {
            altmanZ: altmanZValidation.altmanZ,
          };

          // Skontroluj, či sa Altman Z zmenil
          const oldAltmanZ = ticker.analysisCache?.altmanZ;
          if (
            oldAltmanZ &&
            Math.abs(oldAltmanZ - altmanZValidation.altmanZ) > 0.01
          ) {
            console.log(
              `🔧 ${ticker.symbol} - Altman Z: ${oldAltmanZ.toFixed(2)} → ${altmanZValidation.altmanZ.toFixed(2)}`,
            );
            results.altmanZFixes++;
          }

          await prisma.analysisCache.upsert({
            where: { symbol: ticker.symbol },
            update: updateData,
            create: {
              symbol: ticker.symbol,
              ...updateData,
              healthScore: 50,
              profitabilityScore: 50,
              valuationScore: 50,
              verdictText: "Neutral",
            },
          });

          results.success++;
          console.log(
            `✅ ${ticker.symbol} - Altman Z: ${altmanZValidation.altmanZ.toFixed(2)}`,
          );
        } else {
          results.failed++;
          results.errors.push(
            `${ticker.symbol}: ${altmanZValidation.errors.join(", ")}`,
          );
          console.log(
            `❌ ${ticker.symbol} - Error: ${altmanZValidation.errors.join(", ")}`,
          );
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`${ticker.symbol}: ${error.message}`);
        console.log(`❌ ${ticker.symbol} - Error: ${error.message}`);
      }
    }

    // Súhrn
    console.log("\n📈 SÚHRN REKALKULÁCIE:");
    console.log(`✅ Úspešné: ${results.success}`);
    console.log(`❌ Zlyhané: ${results.failed}`);
    console.log(`🔧 Opravené Altman Z: ${results.altmanZFixes}`);

    if (results.errors.length > 0) {
      console.log("\n❌ ERRORS:");
      results.errors.forEach((error) => console.log(`  ${error}`));
    }
  } catch (error) {
    console.error("❌ Fatal error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

recalculateAllAnalysis();
