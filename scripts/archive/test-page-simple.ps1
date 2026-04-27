# Simple page test script for PowerShell
$baseUrl = "http://localhost:3000"

Write-Host "🧪 Testing page endpoints..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "1. Testing /api/health..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -Method GET -UseBasicParsing -TimeoutSec 5
    Write-Host "   ✅ Status: $($response.StatusCode)" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: $($data.status)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: Stocks API
Write-Host "2. Testing /api/stocks?tickers=AAPL,MSFT..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/stocks?tickers=AAPL,MSFT" -Method GET -UseBasicParsing -TimeoutSec 10
    Write-Host "   ✅ Status: $($response.StatusCode)" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    if ($data.success -and $data.data) {
        Write-Host "   ✅ Returned $($data.data.Count) stocks" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Response: $($response.Content.Substring(0, [Math]::Min(100, $response.Content.Length)))" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: Tickers API
Write-Host "3. Testing /api/tickers/default..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/tickers/default?project=pmp&limit=10" -Method GET -UseBasicParsing -TimeoutSec 5
    Write-Host "   ✅ Status: $($response.StatusCode)" -ForegroundColor Green
    $data = $response.Content | ConvertFrom-Json
    if ($data.success -and $data.data) {
        Write-Host "   ✅ Returned $($data.data.Count) tickers" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: Main page
Write-Host "4. Testing main page /..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/" -Method GET -UseBasicParsing -TimeoutSec 10
    Write-Host "   ✅ Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   Content length: $($response.Content.Length) bytes" -ForegroundColor Gray
    if ($response.Content -match "HomePage|PreMarketPrice") {
        Write-Host "   ✅ Page content detected" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Tests completed!" -ForegroundColor Cyan

