# Test script pre aplikáciu
# Usage: .\scripts\test-app.ps1

Write-Host "🧪 Testing application..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Check if server is running
Write-Host "1️⃣  Checking if server is running on port 3000..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Server is running - Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "   📄 Content length: $($response.Content.Length) bytes" -ForegroundColor Cyan
} catch {
    Write-Host "   ❌ Server not responding: $_" -ForegroundColor Red
    Write-Host "   💡 Make sure server is running: npm run dev:next:no-turbopack" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Test 2: Check API health endpoint
Write-Host "2️⃣  Testing API health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ API health check: $($health.StatusCode)" -ForegroundColor Green
    Write-Host "   📄 Response: $($health.Content)" -ForegroundColor Cyan
} catch {
    Write-Host "   ⚠️  API health check failed: $_" -ForegroundColor Yellow
}

Write-Host ""

# Test 3: Check if page loads without errors
Write-Host "3️⃣  Testing main page load..." -ForegroundColor Yellow
try {
    $page = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    if ($page.Content -match "PreMarketPrice|Market Heatmap|All Stocks") {
        Write-Host "   ✅ Page content looks good" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Page loaded but content might be missing" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Page load failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Testing complete!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Next steps:" -ForegroundColor Cyan
Write-Host "   - Open http://localhost:3000 in browser" -ForegroundColor White
Write-Host "   - Check browser console for errors (F12)" -ForegroundColor White
Write-Host "   - Verify that page loads without Webpack errors" -ForegroundColor White

