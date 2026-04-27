#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEST_CONFIG = {
  url: 'http://localhost:3000',
  outputDir: './mobile-test-reports',
  devices: [
    { name: 'iPhone 12', width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1' },
    { name: 'Samsung Galaxy S21', width: 360, height: 800, userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36' },
    { name: 'iPad Air', width: 820, height: 1180, userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1' },
    { name: 'Desktop', width: 1920, height: 1080, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
  ]
};

if (!fs.existsSync(TEST_CONFIG.outputDir)) {
  fs.mkdirSync(TEST_CONFIG.outputDir, { recursive: true });
}

async function testDevice(device, browser) {
  console.log(`📱 Testing ${device.name}...`);
  
  const page = await browser.newPage();
  await page.setViewport({ width: device.width, height: device.height });
  await page.setUserAgent(device.userAgent);
  
  const results = {
    device: device.name,
    timestamp: new Date().toISOString(),
    tests: {}
  };

  try {
    // Test 1: Page Load
    console.log(`  🔄 Loading page...`);
    const startTime = Date.now();
    await page.goto(TEST_CONFIG.url, { waitUntil: 'networkidle0' });
    const loadTime = Date.now() - startTime;
    results.tests.pageLoad = { success: true, time: loadTime };

    // Test 2: PWA Features
    console.log(`  📱 Testing PWA features...`);
    const pwaFeatures = await page.evaluate(() => {
      return {
        hasServiceWorker: 'serviceWorker' in navigator,
        hasManifest: !!document.querySelector('link[rel="manifest"]'),
        hasAppleTouchIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
        isStandalone: window.matchMedia('(display-mode: standalone)').matches
      };
    });
    results.tests.pwaFeatures = { success: true, features: pwaFeatures };

    // Test 3: Touch Interactions
    console.log(`  👆 Testing touch interactions...`);
    const touchResults = await page.evaluate(() => {
      const touchTargets = document.querySelectorAll('button, .favorite-btn, .nav-item');
      const largeTargets = Array.from(touchTargets).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      });
      return {
        totalTargets: touchTargets.length,
        largeTargets: largeTargets.length,
        percentage: (largeTargets.length / touchTargets.length) * 100
      };
    });
    results.tests.touchTargets = { success: true, data: touchResults };

    // Test 4: Responsive Design
    console.log(`  📐 Testing responsive design...`);
    const responsiveResults = await page.evaluate(() => {
      const hasBottomNav = !!document.querySelector('.bottom-navigation');
      const hasFab = !!document.querySelector('.fab-container');
      const hasMobileLayout = window.innerWidth <= 768;
      return {
        hasBottomNav,
        hasFab,
        isMobileLayout: hasMobileLayout,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });
    results.tests.responsiveDesign = { success: true, data: responsiveResults };

    // Test 5: Performance Metrics
    console.log(`  ⚡ Testing performance...`);
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')?.startTime || 0
      };
    });
    results.tests.performance = { success: true, metrics: performanceMetrics };

    // Test 6: Content Visibility
    console.log(`  👁️ Testing content visibility...`);
    const contentResults = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const sections = document.querySelectorAll('section');
      const images = document.querySelectorAll('img');
      return {
        tablesCount: tables.length,
        sectionsCount: sections.length,
        imagesCount: images.length,
        visibleTables: Array.from(tables).filter(t => t.offsetParent !== null).length,
        visibleSections: Array.from(sections).filter(s => s.offsetParent !== null).length
      };
    });
    results.tests.contentVisibility = { success: true, data: contentResults };

    // Test 7: Accessibility
    console.log(`  ♿ Testing accessibility...`);
    const accessibilityResults = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const inputs = document.querySelectorAll('input');
      const links = document.querySelectorAll('a');
      
      return {
        buttonsWithAria: Array.from(buttons).filter(b => b.hasAttribute('aria-label') || b.hasAttribute('title')).length,
        inputsWithLabels: Array.from(inputs).filter(i => i.hasAttribute('aria-label') || i.hasAttribute('placeholder')).length,
        linksWithText: Array.from(links).filter(l => l.textContent.trim().length > 0).length,
        totalButtons: buttons.length,
        totalInputs: inputs.length,
        totalLinks: links.length
      };
    });
    results.tests.accessibility = { success: true, data: accessibilityResults };

    // Screenshot
    const screenshotPath = path.join(TEST_CONFIG.outputDir, `${device.name.replace(/\s+/g, '-')}-screenshot.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.screenshot = screenshotPath;

    console.log(`  ✅ ${device.name} tests completed successfully`);
    return results;

  } catch (error) {
    console.error(`  ❌ ${device.name} tests failed:`, error.message);
    results.tests.error = { success: false, error: error.message };
    return results;
  } finally {
    await page.close();
  }
}

async function runMobileTests() {
  console.log('🚀 Starting Mobile Testing Suite...');
  console.log('=====================================\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const allResults = [];

  try {
    for (const device of TEST_CONFIG.devices) {
      const result = await testDevice(device, browser);
      allResults.push(result);
    }

    // Generate summary report
    const summary = {
      timestamp: new Date().toISOString(),
      totalDevices: TEST_CONFIG.devices.length,
      successfulTests: allResults.filter(r => !r.tests.error).length,
      failedTests: allResults.filter(r => r.tests.error).length,
      devices: allResults.map(r => ({
        name: r.device,
        success: !r.tests.error,
        loadTime: r.tests.pageLoad?.time || 0,
        pwaFeatures: r.tests.pwaFeatures?.features || {},
        touchTargets: r.tests.touchTargets?.data || {},
        performance: r.tests.performance?.metrics || {}
      }))
    };

    // Save detailed results
    const detailedReportPath = path.join(TEST_CONFIG.outputDir, 'detailed-results.json');
    fs.writeFileSync(detailedReportPath, JSON.stringify(allResults, null, 2));

    // Save summary
    const summaryReportPath = path.join(TEST_CONFIG.outputDir, 'summary-report.json');
    fs.writeFileSync(summaryReportPath, JSON.stringify(summary, null, 2));

    // Print summary
    console.log('\n📊 Mobile Testing Summary');
    console.log('==========================');
    console.log(`Total Devices Tested: ${summary.totalDevices}`);
    console.log(`Successful Tests: ${summary.successfulTests}`);
    console.log(`Failed Tests: ${summary.failedTests}`);
    console.log(`Success Rate: ${((summary.successfulTests / summary.totalDevices) * 100).toFixed(1)}%`);

    console.log('\n📱 Device Results:');
    summary.devices.forEach(device => {
      const status = device.success ? '✅' : '❌';
      const loadTime = device.loadTime > 0 ? `${device.loadTime}ms` : 'N/A';
      console.log(`${status} ${device.name}: ${loadTime}`);
    });

    console.log(`\n📁 Reports saved to: ${TEST_CONFIG.outputDir}`);
    console.log(`📋 Detailed results: ${detailedReportPath}`);
    console.log(`📊 Summary report: ${summaryReportPath}`);

    if (summary.failedTests > 0) {
      console.log('\n⚠️ Some tests failed. Check detailed results for more information.');
      process.exit(1);
    } else {
      console.log('\n🎉 All mobile tests passed!');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Mobile testing failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runMobileTests().catch(error => {
    console.error('❌ Mobile testing failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runMobileTests,
  testDevice
}; 