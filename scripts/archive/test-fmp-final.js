// test-fmp-final.js - Test FMP API with dotenv and native fetch
import "dotenv/config";

async function testFmpApi() {
  const date = new Date("2025-08-04").toISOString().slice(0, 10);
  const fmpApiKey = process.env.FMP_API_KEY || "demo";

  // Test specific tickers we want
  const targetTickers = ["PLTR", "MELI", "VRTX", "WMB", "MUFG"];
  const tickerString = targetTickers.join(",");

  console.log("🔍 Testing FMP API for real earnings data...");
  console.log(`📅 Date: ${date}`);
  console.log(`🎯 Target tickers: ${targetTickers.join(", ")}`);
  console.log(
    `🔑 API Key: ${fmpApiKey === "demo" ? "demo (limited)" : "configured"}`
  );

  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${date}&to=${date}&symbol=${tickerString}&limit=100&apikey=${fmpApiKey}`;

  try {
    console.log(`🌐 Calling: ${url}`);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    console.log(`📊 Response status: ${response.status}`);

    if (response.status === 429) {
      console.error(
        "❌ Rate limit exceeded (429) - 250 calls/day limit reached"
      );
      return;
    }

    if (response.status === 401) {
      console.error("❌ Unauthorized (401) - check API key");
      return;
    }

    if (!response.ok) {
      console.error(`❌ API error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    console.log(`📈 Raw FMP response:`, JSON.stringify(data, null, 2));

    if (Array.isArray(data) && data.length > 0) {
      console.log(`✅ Found ${data.length} earnings records`);

      // Filter for our target tickers
      const filteredData = data.filter(
        (earning) =>
          targetTickers.includes(earning.symbol) && earning.marketCap > 0
      );

      console.log(`🎯 Filtered to ${filteredData.length} target tickers:`);

      filteredData.forEach((earning) => {
        console.log(
          `  ${earning.symbol}: ${earning.company} | Market Cap: $${(
            earning.marketCap / 1000000
          ).toFixed(0)}M | Time: ${earning.time || "N/A"}`
        );
      });

      if (filteredData.length === 0) {
        console.log("⚠️ No target tickers found in FMP data");
      }
    } else {
      console.log("📭 No earnings data returned from FMP API");
    }
  } catch (error) {
    console.error("❌ Error testing FMP API:", error.message);
  }
}

// Run the test
testFmpApi();
