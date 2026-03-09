#!/usr/bin/env node

/**
 * Load Balancer Test Script
 * Testuje funkcionalitu Nginx load balancer
 */

const http = require("http");
const https = require("https");

// Test konfigurácia
const config = {
  loadBalancer: "http://localhost",
  healthCheck: "http://localhost:8080",
  prometheus: "http://localhost:9090",
  grafana: "http://localhost:3001",
  testRequests: 10,
};

// Farbové kódy pre konzolu
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;

    const req = protocol.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
        });
      });
    });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.method === "POST" && options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testHealthCheck() {
  log("\n🔍 Testing Health Check Service...", "blue");

  try {
    const response = await makeRequest(config.healthCheck);
    if (response.statusCode === 200) {
      log("✅ Health Check Service: OK", "green");
      return true;
    } else {
      log(`❌ Health Check Service: Failed (${response.statusCode})`, "red");
      return false;
    }
  } catch (error) {
    log(`❌ Health Check Service: Error - ${error.message}`, "red");
    return false;
  }
}

async function testLoadBalancer() {
  log("\n⚖️ Testing Load Balancer...", "blue");

  try {
    // Test basic functionality
    const testResponse = await makeRequest(`${config.loadBalancer}/test`);
    if (testResponse.statusCode === 200) {
      log("✅ Load Balancer Test Endpoint: OK", "green");
    } else {
      log(
        `❌ Load Balancer Test Endpoint: Failed (${testResponse.statusCode})`,
        "red"
      );
      return false;
    }

    // Test health endpoint
    const healthResponse = await makeRequest(`${config.loadBalancer}/health`);
    if (healthResponse.statusCode === 200) {
      log("✅ Load Balancer Health Endpoint: OK", "green");
    } else {
      log(
        `❌ Load Balancer Health Endpoint: Failed (${healthResponse.statusCode})`,
        "red"
      );
    }

    // Test load balancer status
    const statusResponse = await makeRequest(
      `${config.loadBalancer}/lb-status`
    );
    if (statusResponse.statusCode === 200) {
      log("✅ Load Balancer Status: OK", "green");
      log(`📊 Status Data: ${statusResponse.data.trim()}`, "yellow");
    } else {
      log(
        `❌ Load Balancer Status: Failed (${statusResponse.statusCode})`,
        "red"
      );
    }

    return true;
  } catch (error) {
    log(`❌ Load Balancer Test: Error - ${error.message}`, "red");
    return false;
  }
}

async function testMonitoring() {
  log("\n📊 Testing Monitoring Services...", "blue");

  const services = [
    { name: "Prometheus", url: config.prometheus },
    { name: "Grafana", url: config.grafana },
  ];

  for (const service of services) {
    try {
      const response = await makeRequest(service.url);
      if (response.statusCode === 200) {
        log(`✅ ${service.name}: OK`, "green");
      } else {
        log(`❌ ${service.name}: Failed (${response.statusCode})`, "red");
      }
    } catch (error) {
      log(`❌ ${service.name}: Error - ${error.message}`, "red");
    }
  }
}

async function testRateLimiting() {
  log("\n🚦 Testing Rate Limiting...", "blue");

  const requests = [];
  const startTime = Date.now();

  // Vytvoriť viacero requestov naraz
  for (let i = 0; i < config.testRequests; i++) {
    requests.push(
      makeRequest(`${config.loadBalancer}/test`)
        .then((response) => ({
          success: true,
          statusCode: response.statusCode,
        }))
        .catch((error) => ({ success: false, error: error.message }))
    );
  }

  const results = await Promise.all(requests);
  const endTime = Date.now();
  const duration = endTime - startTime;

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const rateLimited = results.filter((r) => r.statusCode === 429).length;

  log(`📈 Test Results:`, "yellow");
  log(`   Total Requests: ${config.testRequests}`, "yellow");
  log(`   Successful: ${successful}`, "green");
  log(`   Failed: ${failed}`, "red");
  log(`   Rate Limited: ${rateLimited}`, "yellow");
  log(`   Duration: ${duration}ms`, "yellow");
  log(
    `   Requests/sec: ${(config.testRequests / (duration / 1000)).toFixed(2)}`,
    "yellow"
  );
}

async function runAllTests() {
  log("🚀 Starting Load Balancer Tests...", "bold");
  log("=" * 50, "blue");

  const results = {
    healthCheck: await testHealthCheck(),
    loadBalancer: await testLoadBalancer(),
    monitoring: await testMonitoring(),
  };

  await testRateLimiting();

  log("\n📋 Test Summary:", "bold");
  log("=" * 30, "blue");

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? "✅ PASSED" : "❌ FAILED";
    const color = passed ? "green" : "red";
    log(`${test}: ${status}`, color);
  });

  const allPassed = Object.values(results).every((result) => result);

  if (allPassed) {
    log("\n🎉 All tests passed! Load Balancer is working correctly.", "green");
  } else {
    log("\n⚠️ Some tests failed. Check the configuration.", "red");
  }

  log("\n🔗 Service URLs:", "blue");
  log(`   Load Balancer: ${config.loadBalancer}`, "yellow");
  log(`   Health Check: ${config.healthCheck}`, "yellow");
  log(`   Prometheus: ${config.prometheus}`, "yellow");
  log(`   Grafana: ${config.grafana}`, "yellow");
}

// Spustenie testov
if (require.main === module) {
  runAllTests().catch((error) => {
    log(`❌ Test execution failed: ${error.message}`, "red");
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testHealthCheck,
  testLoadBalancer,
  testMonitoring,
  testRateLimiting,
};
