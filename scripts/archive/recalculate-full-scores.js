#!/usr/bin/env node

// Importujeme AnalysisService pomocí require, pretože je to TypeScript
const { AnalysisService } = require("../src/services/analysisService.ts");

async function recalculateFullScores() {
  try {
    console.log(" Prepočítavam úplné skóre pre všetky tickery...");

    const tickers = ["AAPL", "MSFT", "GOOGL", "NVDA", "AMZN", "TSLA"];

    for (const symbol of tickers) {
      try {
        console.log(`🔍 Spracujem ${symbol}...`);
        await AnalysisService.calculateScores(symbol);
        console.log(`✅ ${symbol} - Hotovo`);
      } catch (error) {
        console.log(`❌ ${symbol} - Error: ${error.message}`);
      }
    }

    console.log("\n🎉 Všetky skóre prepočítané!");
  } catch (error) {
    console.error("❌ Fatal error:", error);
  }
}

recalculateFullScores();
