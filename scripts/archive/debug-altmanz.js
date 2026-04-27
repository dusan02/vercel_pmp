#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function debugAltmanZ() {
  try {
    console.log("🔍 Debug Altman Z výpočtu...");

    const ticker = await prisma.ticker.findUnique({
      where: { symbol: "AAPL" },
      include: {
        financialStatements: {
          orderBy: { endDate: "desc" },
          take: 2,
        },
      },
    });

    if (!ticker) {
      console.log("❌ AAPL neexistuje");
      return;
    }

    const latestStmt = ticker.financialStatements[0];
    const currentPrice = ticker.lastPrice;
    // Prioritizuj sharesOutstanding z financial statement (presnejšie)
    const sharesOutstanding =
      latestStmt.sharesOutstanding || ticker.sharesOutstanding;
    const marketCap = ticker.lastMarketCap;

    console.log("\n📊 Vstupné hodnoty:");
    console.log(`Current Price: $${currentPrice}`);
    console.log(`Shares Outstanding: ${sharesOutstanding?.toLocaleString()}`);
    console.log(`Market Cap: $${(marketCap / 1e12).toFixed(2)}T`);
    console.log(
      `Shares from statement: ${latestStmt.sharesOutstanding?.toLocaleString()}`,
    );

    // Výpočet Market Value of Equity
    const marketValueOfEquity =
      sharesOutstanding && sharesOutstanding > 0 && currentPrice > 0
        ? sharesOutstanding * currentPrice
        : marketCap;

    console.log(
      `\n💰 Market Value of Equity: $${(marketValueOfEquity / 1e12).toFixed(2)}T`,
    );
    console.log(
      `   (Shares × Price = ${sharesOutstanding?.toLocaleString()} × $${currentPrice})`,
    );

    // Altman Z komponenty
    const A =
      ((latestStmt.currentAssets || 0) - (latestStmt.currentLiabilities || 0)) /
      latestStmt.totalAssets;
    const B = (latestStmt.retainedEarnings || 0) / latestStmt.totalAssets;
    const C = (latestStmt.ebit || 0) / latestStmt.totalAssets;
    const D =
      latestStmt.totalLiabilities &&
      latestStmt.totalLiabilities > 0 &&
      marketValueOfEquity > 0
        ? marketValueOfEquity / latestStmt.totalLiabilities
        : 0;
    const E = (latestStmt.revenue || 0) / latestStmt.totalAssets;

    const altmanZ = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;

    console.log("\n🧮 Altman Z komponenty:");
    console.log(
      `A = (Current Assets - Current Liabilities) / Total Assets = ${A.toFixed(4)}`,
    );
    console.log(`B = Retained Earnings / Total Assets = ${B.toFixed(4)}`);
    console.log(`C = EBIT / Total Assets = ${C.toFixed(4)}`);
    console.log(
      `D = Market Value of Equity / Total Liabilities = ${D.toFixed(4)}`,
    );
    console.log(`E = Revenue / Total Assets = ${E.toFixed(4)}`);

    console.log("\n🎯 Altman Z výpočet:");
    console.log(
      `Altman Z = 1.2×${A.toFixed(4)} + 1.4×${B.toFixed(4)} + 3.3×${C.toFixed(4)} + 0.6×${D.toFixed(4)} + 1.0×${E.toFixed(4)}`,
    );
    console.log(
      `Altman Z = ${(1.2 * A).toFixed(2)} + ${(1.4 * B).toFixed(2)} + ${(3.3 * C).toFixed(2)} + ${(0.6 * D).toFixed(2)} + ${(1.0 * E).toFixed(2)}`,
    );
    console.log(`Altman Z = ${altmanZ.toFixed(2)}`);

    console.log("\n📈 Porovnanie s cache:");
    console.log(`Vypočítaný: ${altmanZ.toFixed(2)}`);
    console.log(`Cache: ${ticker.analysisCache?.altmanZ?.toFixed(2) || "N/A"}`);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAltmanZ();
