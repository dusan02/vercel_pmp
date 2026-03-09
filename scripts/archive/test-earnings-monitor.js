// Testovací súbor pre earnings monitorovanie
const fetch = require("node-fetch");

async function testEarningsMonitor() {
  console.log("🧪 Testing earnings monitor...");

  try {
    // Test 1: Manuálna kontrola pre dnešný deň
    console.log("\n📅 Test 1: Manual check for today");
    const response1 = await fetch("http://localhost:3000/api/earnings/monitor");
    console.log("Response status:", response1.status);
    const result1 = await response1.json();
    console.log("Result:", JSON.stringify(result1, null, 2));

    // Test 2: Kontrola pre konkrétny dátum
    console.log("\n📅 Test 2: Check for specific date (2024-02-06)");
    const response2 = await fetch(
      "http://localhost:3000/api/earnings/monitor?date=2024-02-06"
    );
    console.log("Response status:", response2.status);
    const result2 = await response2.json();
    console.log("Result:", JSON.stringify(result2, null, 2));

    // Test 3: Automatické monitorovanie
    console.log("\n🤖 Test 3: Auto monitoring");
    const response3 = await fetch(
      "http://localhost:3000/api/earnings/monitor?auto=true"
    );
    console.log("Response status:", response3.status);
    const result3 = await response3.json();
    console.log("Result:", JSON.stringify(result3, null, 2));
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Full error:", error);
  }
}

// Spustenie testu
testEarningsMonitor();
