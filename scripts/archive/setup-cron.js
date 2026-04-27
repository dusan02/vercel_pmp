#!/usr/bin/env node

/**
 * Script na nastavenie cron job pre denné aktualizácie earnings calendar
 *
 * Tento script sa spúšťa o 00:01 každý deň a aktualizuje earnings calendar
 * pre daný deň z Yahoo Finance API.
 */

const https = require("https");
const http = require("http");

// Konfigurácia
const CRON_URL =
  process.env.CRON_URL || "http://localhost:3000/api/cron/earnings-calendar";
const CRON_SECRET = process.env.CRON_SECRET_KEY || "your-secret-key";

/**
 * Spustí cron job pre aktualizáciu earnings calendar
 */
async function runEarningsCalendarUpdate() {
  const today = new Date().toISOString().split("T")[0];

  console.log(`🚀 Starting earnings calendar update for ${today}...`);

  try {
    // Vytvor request options
    const url = new URL(CRON_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 3000),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
        "User-Agent": "PMP-Cron-Job/1.0",
      },
    };

    // Vytvor request
    const client = url.protocol === "https:" ? https : http;

    const req = client.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode === 200 && response.success) {
            console.log(`✅ Earnings calendar update completed successfully!`);
            console.log(`📊 Records processed: ${response.recordsProcessed}`);
            console.log(`📅 Date: ${today}`);
          } else {
            console.error(
              `❌ Earnings calendar update failed:`,
              response.error || response.message
            );
            process.exit(1);
          }
        } catch (error) {
          console.error(`❌ Failed to parse response:`, error);
          console.log(`Raw response:`, data);
          process.exit(1);
        }
      });
    });

    req.on("error", (error) => {
      console.error(`❌ Request failed:`, error);
      process.exit(1);
    });

    // Nastav timeout
    req.setTimeout(300000, () => {
      // 5 minút
      console.error(`❌ Request timeout after 5 minutes`);
      req.destroy();
      process.exit(1);
    });

    // Pošli request
    req.write(JSON.stringify({ date: today }));
    req.end();
  } catch (error) {
    console.error(`❌ Cron job failed:`, error);
    process.exit(1);
  }
}

/**
 * Spustí cron job pre reset earnings calendar (23:59)
 */
async function resetEarningsCalendar() {
  const today = new Date().toISOString().split("T")[0];

  console.log(`🗑️ Starting earnings calendar reset for ${today}...`);

  try {
    const url = new URL(CRON_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 3000),
      path: url.pathname + "/reset",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
        "User-Agent": "PMP-Cron-Job/1.0",
      },
    };

    const client = url.protocol === "https:" ? https : http;

    const req = client.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode === 200 && response.success) {
            console.log(`✅ Earnings calendar reset completed successfully!`);
            console.log(`📅 Date: ${today}`);
          } else {
            console.error(
              `❌ Earnings calendar reset failed:`,
              response.error || response.message
            );
            process.exit(1);
          }
        } catch (error) {
          console.error(`❌ Failed to parse response:`, error);
          process.exit(1);
        }
      });
    });

    req.on("error", (error) => {
      console.error(`❌ Request failed:`, error);
      process.exit(1);
    });

    req.setTimeout(60000, () => {
      // 1 minúta
      console.error(`❌ Request timeout after 1 minute`);
      req.destroy();
      process.exit(1);
    });

    req.write(JSON.stringify({ date: today }));
    req.end();
  } catch (error) {
    console.error(`❌ Reset job failed:`, error);
    process.exit(1);
  }
}

// Spustí podľa argumentov
const action = process.argv[2];

if (action === "update") {
  runEarningsCalendarUpdate();
} else if (action === "reset") {
  resetEarningsCalendar();
} else {
  console.log("Usage: node setup-cron.js [update|reset]");
  console.log("");
  console.log("Commands:");
  console.log("  update  - Update earnings calendar (run at 00:01)");
  console.log("  reset   - Reset earnings calendar (run at 23:59)");
  console.log("");
  console.log("Environment variables:");
  console.log("  CRON_URL        - URL of the cron endpoint");
  console.log("  CRON_SECRET_KEY - Secret key for authentication");
  process.exit(1);
}
