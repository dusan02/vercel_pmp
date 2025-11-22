# Simple Application Test

Write-Host "🧪 Testing Application" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"

# Test 1: Server
Write-Host "1. Server Check..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $baseUrl -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Server running (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Server not responding" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Heatmap API (with longer timeout)
Write-Host ""
Write-Host "2. Heatmap API..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/heatmap" -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    if ($data.success) {
        Write-Host "   ✅ Heatmap API working" -ForegroundColor Green
        Write-Host "   Count: $($data.count), Cached: $($data.cached)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️ Heatmap API returned error: $($data.error)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Heatmap API failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Database
Write-Host ""
Write-Host "3. Database..." -ForegroundColor Yellow
$env:DATABASE_URL = "file:./prisma/dev.db"
$result = node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.ticker.count().then(c => { console.log('OK:' + c); p.`$disconnect(); });"
if ($result -match "OK:(\d+)") {
    Write-Host "   ✅ Database connected" -ForegroundColor Green
    Write-Host "   Tickers: $($matches[1])" -ForegroundColor Gray
} else {
    Write-Host "   ❌ Database test failed" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Basic tests completed" -ForegroundColor Green

