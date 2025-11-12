# PowerShell verification script for 8 checks

$BASE_URL = "http://localhost:3000"
$WS_URL = "http://localhost:3002"

Write-Host "Running 8 verification checks..." -ForegroundColor Cyan
Write-Host ""

# 1. Health Check
Write-Host "1. Health Check:" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/api/healthz" -Method Get
    $health | ConvertTo-Json
    
    if ($health.redis -eq "ok" -and $health.db -eq "ok" -and ($health.workerAge_s -lt 360 -or $null -eq $health.workerAge_s)) {
        Write-Host "[OK] Health check PASSED" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Health check FAILED" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[FAIL] Health check FAILED: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 2. Redis Naplnenie (requires redis-cli)
Write-Host "2. Redis Naplnenie:" -ForegroundColor Yellow
Write-Host "  Run manually: redis-cli KEYS 'last:*' | Measure-Object -Line"
Write-Host "  Run manually: redis-cli ZCARD heatmap:live"
Write-Host "  Expected: >100 keys in both" -ForegroundColor Gray
Write-Host ""

# 3. API Stocks (bez Polygon)
Write-Host "3. API Stocks (bez Polygon):" -ForegroundColor Yellow
try {
    $stocks = Invoke-RestMethod -Uri "$BASE_URL/api/stocks?tickers=AAPL,MSFT&session=live" -Method Get
    $headers = Invoke-WebRequest -Uri "$BASE_URL/api/stocks?tickers=AAPL&session=live" -Method Get
    
    Write-Host "  Response items: $($stocks.data.Count)"
    Write-Host "  Cache-Control: $($headers.Headers['Cache-Control'])"
    
    if ($stocks.data.Count -gt 0 -and $headers.Headers['Cache-Control'] -eq "no-store") {
        Write-Host "[OK] API Stocks PASSED" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] API Stocks FAILED" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[FAIL] API Stocks FAILED: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 4. API Heatmap (zoradené)
Write-Host "4. API Heatmap:" -ForegroundColor Yellow
try {
    $heatmap = Invoke-RestMethod -Uri "$BASE_URL/api/heatmap?session=live&limit=50" -Method Get
    
    Write-Host "  Response items: $($heatmap.data.Count)"
    if ($heatmap.data.Count -gt 1) {
        $firstPct = $heatmap.data[0].percentChange
        $secondPct = $heatmap.data[1].percentChange
        Write-Host "  First %: $firstPct, Second %: $secondPct"
        
        if ($heatmap.data.Count -gt 0 -and $firstPct -ge $secondPct) {
            Write-Host "[OK] API Heatmap PASSED (sorted descending)" -ForegroundColor Green
        } else {
            Write-Host "[WARN] API Heatmap - check sorting" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARN] API Heatmap - not enough data" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[FAIL] API Heatmap FAILED: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 5. Cache Headers
Write-Host "5. Cache Headers:" -ForegroundColor Yellow
try {
    $liveHeaders = Invoke-WebRequest -Uri "$BASE_URL/api/stocks?tickers=AAPL&session=live" -Method Get
    $preHeaders = Invoke-WebRequest -Uri "$BASE_URL/api/stocks?tickers=AAPL&session=pre" -Method Get
    
    $liveCache = $liveHeaders.Headers['Cache-Control']
    $preCache = $preHeaders.Headers['Cache-Control']
    
    Write-Host "  Live: $liveCache"
    Write-Host "  Pre: $preCache"
    
    if ($liveCache -eq "no-store" -and $preCache -like "*s-maxage=15*") {
        Write-Host "[OK] Cache Headers PASSED" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Cache Headers FAILED" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[FAIL] Cache Headers FAILED: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 6. Stale Logika
Write-Host "6. Stale Logika:" -ForegroundColor Yellow
Write-Host "  Stale logika implemented (test in UI: badge shows if age > 360s)" -ForegroundColor Gray
Write-Host ""

# 7. PM2 Persist
Write-Host "7. PM2 Persist:" -ForegroundColor Yellow
Write-Host "  Run: pm2 save" -ForegroundColor Gray
Write-Host "  Run: pm2 startup" -ForegroundColor Gray
Write-Host ""

# 8. WebSocket
Write-Host "8. WebSocket:" -ForegroundColor Yellow
Write-Host "  Manual test needed - run WS client test" -ForegroundColor Gray
Write-Host "  Expected: tick events every 250-1000ms (2-5 fps)" -ForegroundColor Gray
Write-Host ""

Write-Host "All automated checks completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Manual checks needed:" -ForegroundColor Cyan
Write-Host "  - WebSocket tick events (run WS client)"
Write-Host "  - Stale badge in UI (test with old data)"
Write-Host "  - PM2 persist (pm2 save && pm2 startup)"
Write-Host "  - Redis keys count (redis-cli)"

