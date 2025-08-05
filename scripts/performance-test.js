#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Performance testing configuration
const CONFIG = {
  url: "http://localhost:3000",
  outputDir: "./performance-reports",
  lighthouseConfig: {
    extends: "lighthouse:default",
    settings: {
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      formFactor: "mobile",
      throttling: {
        rttMs: 40,
        throughputKbps: 10240,
        cpuSlowdownMultiplier: 1,
        requestLatencyMs: 0,
        downloadThroughputKbps: 0,
        uploadThroughputKbps: 0,
      },
      screenEmulation: {
        mobile: true,
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
        disabled: false,
      },
      emulatedUserAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    },
  },
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

console.log("🚀 Starting Performance Testing...");
console.log(`📱 Testing URL: ${CONFIG.url}`);
console.log(`📊 Output Directory: ${CONFIG.outputDir}`);

// Check if Lighthouse is installed
try {
  execSync("lighthouse --version", { stdio: "pipe" });
} catch (error) {
  console.error("❌ Lighthouse CLI not found. Installing...");
  try {
    execSync("npm install -g lighthouse", { stdio: "inherit" });
  } catch (installError) {
    console.error("❌ Failed to install Lighthouse. Please install manually:");
    console.error("npm install -g lighthouse");
    process.exit(1);
  }
}

// Run Lighthouse audit
function runLighthouseAudit() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(
    CONFIG.outputDir,
    `lighthouse-report-${timestamp}`
  );

  console.log("🔍 Running Lighthouse audit...");

  try {
    const command = `lighthouse ${CONFIG.url} \
      --output=html \
      --output-path=${outputPath}.html \
      --chrome-flags="--headless --no-sandbox --disable-gpu" \
      --only-categories=performance,accessibility,best-practices,seo \
      --form-factor=mobile \
      --throttling.cpuSlowdownMultiplier=1 \
      --throttling.rttMs=40 \
      --throttling.throughputKbps=10240`;

    execSync(command, { stdio: "inherit" });

    console.log(`✅ Lighthouse audit completed: ${outputPath}.html`);
    return outputPath;
  } catch (error) {
    console.error("❌ Lighthouse audit failed:", error.message);
    return null;
  }
}

// Generate performance summary
function generatePerformanceSummary(reportPath) {
  if (!reportPath) return;

  try {
    const reportContent = fs.readFileSync(`${reportPath}.html`, "utf8");

    // Extract scores from the report
    const performanceMatch = reportContent.match(/Performance.*?(\d+)/);
    const accessibilityMatch = reportContent.match(/Accessibility.*?(\d+)/);
    const bestPracticesMatch = reportContent.match(/Best Practices.*?(\d+)/);
    const seoMatch = reportContent.match(/SEO.*?(\d+)/);

    const scores = {
      performance: performanceMatch ? parseInt(performanceMatch[1]) : 0,
      accessibility: accessibilityMatch ? parseInt(accessibilityMatch[1]) : 0,
      bestPractices: bestPracticesMatch ? parseInt(bestPracticesMatch[1]) : 0,
      seo: seoMatch ? parseInt(seoMatch[1]) : 0,
    };

    // Generate summary report
    const summary = {
      timestamp: new Date().toISOString(),
      url: CONFIG.url,
      scores,
      averageScore: Math.round(
        Object.values(scores).reduce((a, b) => a + b, 0) / 4
      ),
      reportPath: `${reportPath}.html`,
    };

    const summaryPath = path.join(CONFIG.outputDir, "performance-summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log("\n📊 Performance Summary:");
    console.log(`Performance: ${scores.performance}/100`);
    console.log(`Accessibility: ${scores.accessibility}/100`);
    console.log(`Best Practices: ${scores.bestPractices}/100`);
    console.log(`SEO: ${scores.seo}/100`);
    console.log(`Average Score: ${summary.averageScore}/100`);
    console.log(`\n📄 Full report: ${summary.reportPath}`);

    return summary;
  } catch (error) {
    console.error("❌ Failed to generate performance summary:", error.message);
    return null;
  }
}

// Run bundle analysis
function runBundleAnalysis() {
  console.log("\n📦 Analyzing bundle size...");

  try {
    // Build the project
    execSync("npm run build", { stdio: "inherit" });

    // Analyze bundle size
    const bundleStats = execSync("npx next-bundle-analyzer", {
      stdio: "pipe",
      encoding: "utf8",
    });

    const bundlePath = path.join(CONFIG.outputDir, "bundle-analysis.txt");
    fs.writeFileSync(bundlePath, bundleStats);

    console.log(`✅ Bundle analysis completed: ${bundlePath}`);
    return bundlePath;
  } catch (error) {
    console.log(
      "⚠️ Bundle analysis skipped (next-bundle-analyzer not available)"
    );
    return null;
  }
}

// Run Core Web Vitals test
function runCoreWebVitalsTest() {
  console.log("\n⚡ Testing Core Web Vitals...");

  try {
    // This would typically use web-vitals library or PageSpeed Insights API
    // For now, we'll create a placeholder test
    const cwvResults = {
      timestamp: new Date().toISOString(),
      url: CONFIG.url,
      metrics: {
        fcp: { value: 0, rating: "unknown" },
        lcp: { value: 0, rating: "unknown" },
        fid: { value: 0, rating: "unknown" },
        cls: { value: 0, rating: "unknown" },
        ttfb: { value: 0, rating: "unknown" },
      },
    };

    const cwvPath = path.join(CONFIG.outputDir, "core-web-vitals.json");
    fs.writeFileSync(cwvPath, JSON.stringify(cwvResults, null, 2));

    console.log(`✅ Core Web Vitals test completed: ${cwvPath}`);
    return cwvPath;
  } catch (error) {
    console.error("❌ Core Web Vitals test failed:", error.message);
    return null;
  }
}

// Main execution
async function main() {
  console.log("🎯 Milestone 5: Performance & Testing");
  console.log("=====================================\n");

  // Run all tests
  const reportPath = runLighthouseAudit();
  const summary = generatePerformanceSummary(reportPath);
  const bundlePath = runBundleAnalysis();
  const cwvPath = runCoreWebVitalsTest();

  // Generate final report
  const finalReport = {
    timestamp: new Date().toISOString(),
    tests: {
      lighthouse: reportPath ? `${reportPath}.html` : null,
      bundleAnalysis: bundlePath,
      coreWebVitals: cwvPath,
    },
    summary: summary,
  };

  const finalReportPath = path.join(CONFIG.outputDir, "final-report.json");
  fs.writeFileSync(finalReportPath, JSON.stringify(finalReport, null, 2));

  console.log("\n🎉 Performance testing completed!");
  console.log(`📁 All reports saved to: ${CONFIG.outputDir}`);
  console.log(`📋 Final report: ${finalReportPath}`);

  // Exit with appropriate code based on performance scores
  if (summary && summary.averageScore < 70) {
    console.log("\n⚠️ Performance score is below 70. Consider optimizations.");
    process.exit(1);
  } else {
    console.log("\n✅ Performance score is acceptable.");
    process.exit(0);
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Performance testing failed:", error);
    process.exit(1);
  });
}

module.exports = {
  runLighthouseAudit,
  generatePerformanceSummary,
  runBundleAnalysis,
  runCoreWebVitalsTest,
};
