async function checkProductionFreshness() {
  console.log("=== PMP Production Freshness Check ===\n");
  
  try {
    // 1. Check worker health and overall freshness
    console.log("1. Checking Worker Health (/api/health/worker)...");
    const workerRes = await fetch("https://premarketprice.com/api/health/worker", { cache: "no-store" });
    if (!workerRes.ok) {
      console.log(`❌ Failed to fetch worker health: ${workerRes.status} ${workerRes.statusText}`);
    } else {
      const workerData = await workerRes.json();
      console.log(`✅ Status: ${workerData.status}`);
      if (workerData.freshness) {
        console.log(`   P50 Age: ${workerData.freshness.agePercentiles?.p50?.toFixed(2)} mins`);
        console.log(`   P90 Age: ${workerData.freshness.agePercentiles?.p90?.toFixed(2)} mins`);
        console.log(`   P99 Age: ${workerData.freshness.agePercentiles?.p99?.toFixed(2)} mins`);
        console.log(`   Total Tickers: ${workerData.freshness.totalTickers}`);
        console.log(`   Stale Tickers (>15m): ${workerData.freshness.staleTickers}`);
      }
      if (workerData.worker) {
        console.log(`   Last Worker Run: ${new Date(workerData.worker.lastRun).toLocaleString()} (${workerData.worker.ageMinutes?.toFixed(2)} mins ago)`);
      }
    }
  } catch (e: any) {
    console.log(`❌ Error checking worker health: ${e.message}`);
  }

  console.log("\n2. Checking Sample Tickers Data...");
  try {
    const tickersRes = await fetch("https://premarketprice.com/api/tickers?symbols=AAPL,NVDA,TSLA,SPY", { cache: "no-store" });
    if (!tickersRes.ok) {
      console.log(`❌ Failed to fetch tickers: ${tickersRes.status} ${tickersRes.statusText}`);
    } else {
      const data = await tickersRes.json();
      if (!data.data || !Array.isArray(data.data)) {
        console.log("❌ Unexpected data format received.");
      } else {
        const now = Date.now();
        data.data.forEach((t: any) => {
          const timestamp = new Date(t.timestamp).getTime();
          const ageMins = (now - timestamp) / 60000;
          console.log(`   ${t.symbol.padEnd(5)} | Price: $${t.price?.toFixed(2) || 'N/A'} | Age: ${ageMins.toFixed(2)} mins | Timestamp: ${new Date(t.timestamp).toLocaleString()}`);
        });
      }
    }
  } catch (e: any) {
    console.log(`❌ Error checking sample tickers: ${e.message}`);
  }
}

checkProductionFreshness();
