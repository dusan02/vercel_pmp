# Comprehensive Application Test Script

Write-Host "🧪 Testing PreMarketPrice Application" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"
$testResults = @()

# Test 1: Server Health
Write-Host "1. Server Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $baseUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    $testResults += @{ Test = "Server Health"; Status = "✅ PASS"; Details = "Status: $($response.StatusCode)" }
    Write-Host "   ✅ Server is running (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    $testResults += @{ Test = "Server Health"; Status = "❌ FAIL"; Details = $_.Exception.Message }
    Write-Host "   ❌ Server not responding: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Heatmap API
Write-Host "2. Heatmap API (/api/heatmap)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/heatmap" -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    if ($data.success) {
        $testResults += @{ Test = "Heatmap API"; Status = "✅ PASS"; Details = "Count: $($data.count), Cached: $($data.cached)" }
        Write-Host "   ✅ Heatmap API: Success, Count=$($data.count), Cached=$($data.cached)" -ForegroundColor Green
    } else {
        $testResults += @{ Test = "Heatmap API"; Status = "⚠️ WARN"; Details = "Success=false, Error: $($data.error)" }
        Write-Host "   ⚠️ Heatmap API returned error: $($data.error)" -ForegroundColor Yellow
    }
} catch {
    $testResults += @{ Test = "Heatmap API"; Status = "❌ FAIL"; Details = $_.Exception.Message }
    Write-Host "   ❌ Heatmap API failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Stocks Optimized API
Write-Host "3. Stocks Optimized API (/api/stocks/optimized)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/stocks/optimized?limit=10&sort=mcap&dir=desc" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    if ($data.rows -and $data.rows.Count -gt 0) {
        $testResults += @{ Test = "Stocks Optimized API"; Status = "✅ PASS"; Details = "Rows: $($data.rows.Count)" }
        Write-Host "   ✅ Stocks API: $($data.rows.Count) rows returned" -ForegroundColor Green
    } else {
        $testResults += @{ Test = "Stocks Optimized API"; Status = "⚠️ WARN"; Details = "No rows returned" }
        Write-Host "   ⚠️ Stocks API: No rows returned" -ForegroundColor Yellow
    }
} catch {
    $testResults += @{ Test = "Stocks Optimized API"; Status = "❌ FAIL"; Details = $_.Exception.Message }
    Write-Host "   ❌ Stocks API failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Database Connection
Write-Host "4. Database Connection..." -ForegroundColor Yellow
try {
    $env:DATABASE_URL = "file:./prisma/dev.db"
    $dbResult = node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.ticker.count().then(c => { console.log(JSON.stringify({tickers: c, success: true})); prisma.`$disconnect(); }).catch(e => { console.log(JSON.stringify({error: e.message, success: false})); process.exit(1); });"
    $dbData = $dbResult | ConvertFrom-Json
    if ($dbData.success) {
        $testResults += @{ Test = "Database Connection"; Status = "✅ PASS"; Details = "Tickers: $($dbData.tickers)" }
        Write-Host "   ✅ Database: Connected, $($dbData.tickers) tickers" -ForegroundColor Green
    } else {
        $testResults += @{ Test = "Database Connection"; Status = "❌ FAIL"; Details = $dbData.error }
        Write-Host "   ❌ Database error: $($dbData.error)" -ForegroundColor Red
    }
} catch {
    $testResults += @{ Test = "Database Connection"; Status = "❌ FAIL"; Details = $_.Exception.Message }
    Write-Host "   ❌ Database test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: API Response Times
Write-Host "5. API Performance Test..." -ForegroundColor Yellow
$endpoints = @(
    @{ Name = "Heatmap"; Url = "$baseUrl/api/heatmap" },
    @{ Name = "Stocks (10)"; Url = "$baseUrl/api/stocks/optimized?limit=10" }
)

foreach ($endpoint in $endpoints) {
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest -Uri $endpoint.Url -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
        $stopwatch.Stop()
        $responseTime = $stopwatch.ElapsedMilliseconds
        $testResults += @{ Test = "$($endpoint.Name) Performance"; Status = "✅ PASS"; Details = "${responseTime}ms" }
        Write-Host "   ✅ $($endpoint.Name): ${responseTime}ms" -ForegroundColor Green
    } catch {
        $testResults += @{ Test = "$($endpoint.Name) Performance"; Status = "❌ FAIL"; Details = $_.Exception.Message }
        Write-Host "   ❌ $($endpoint.Name) failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "📊 Test Summary" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

$passed = ($testResults | Where-Object { $_.Status -like "✅*" }).Count
$failed = ($testResults | Where-Object { $_.Status -like "❌*" }).Count
$warned = ($testResults | Where-Object { $_.Status -like "⚠️*" }).Count

foreach ($result in $testResults) {
    Write-Host "$($result.Status) $($result.Test)" -ForegroundColor $(if ($result.Status -like "✅*") { "Green" } elseif ($result.Status -like "❌*") { "Red" } else { "Yellow" })
    Write-Host "   $($result.Details)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Total: $($testResults.Count) tests" -ForegroundColor Cyan
Write-Host "✅ Passed: $passed" -ForegroundColor Green
Write-Host "⚠️ Warnings: $warned" -ForegroundColor Yellow
Write-Host "❌ Failed: $failed" -ForegroundColor Red

if ($failed -eq 0) {
    Write-Host ""
    Write-Host "🎉 All critical tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "⚠️ Some tests failed. Please check the errors above." -ForegroundColor Yellow
    exit 1
}

