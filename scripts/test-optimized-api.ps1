# PowerShell test script for optimized API endpoint
# Tests: ETag/304, payload size, keyset stability

$URL = "http://localhost:3000/api/stocks/optimized?sort=mcap&dir=desc&limit=50"

Write-Host "`n=== Testing Optimized API ===" -ForegroundColor Cyan
Write-Host ""

# 1. First request - get ETag
Write-Host "1. First request (getting ETag)..." -ForegroundColor Yellow
try {
    $Response1 = Invoke-WebRequest -Uri $URL -Method GET -Headers @{"Accept"="application/json"} -UseBasicParsing
    $ETag = $Response1.Headers['ETag']
    $Status1 = $Response1.StatusCode
    
    Write-Host "   Status: $Status1" -ForegroundColor White
    Write-Host "   ETag: $ETag" -ForegroundColor White
    Write-Host ""
    
    # 2. Conditional GET with ETag (should return 304)
    if ($ETag) {
        Write-Host "2. Conditional GET with ETag (expecting 304)..." -ForegroundColor Yellow
        try {
            $Response2 = Invoke-WebRequest -Uri $URL -Method GET -Headers @{"If-None-Match"=$ETag} -UseBasicParsing -ErrorAction SilentlyContinue
            $Status2 = $Response2.StatusCode
        } catch {
            $Status2 = $_.Exception.Response.StatusCode.value__
        }
        
        Write-Host "   Status: $Status2 (expected: 304)" -ForegroundColor White
        if ($Status2 -eq 304) {
            Write-Host "   ✅ 304 Not Modified - ETag working correctly" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Expected 304, got $Status2" -ForegroundColor Red
        }
        Write-Host ""
    }
    
    # 3. Payload size check
    Write-Host "3. Payload size check..." -ForegroundColor Yellow
    $Payload = $Response1.Content
    $Bytes = [System.Text.Encoding]::UTF8.GetByteCount($Payload)
    Write-Host "   Payload size: $Bytes bytes" -ForegroundColor White
    if ($Bytes -lt 30000) {
        Write-Host "   ✅ Payload < 30 KB (target: < 30 KB)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ Payload >= 30 KB (consider optimization)" -ForegroundColor Yellow
    }
    Write-Host ""
    
    # 4. Keyset pagination stability
    Write-Host "4. Keyset pagination stability test..." -ForegroundColor Yellow
    $Page1Json = $Payload | ConvertFrom-Json
    $Cursor1 = $Page1Json.nextCursor
    $First1 = $Page1Json.rows[0].t
    $Last1 = $Page1Json.rows[-1].t
    
    if ($Cursor1) {
        $Page2Url = "$URL&cursor=$Cursor1"
        $Page2Response = Invoke-WebRequest -Uri $Page2Url -Method GET -UseBasicParsing
        $Page2Json = $Page2Response.Content | ConvertFrom-Json
        $First2 = $Page2Json.rows[0].t
        
        Write-Host "   Page 1 - First: $First1, Last: $Last1" -ForegroundColor White
        Write-Host "   Page 2 - First: $First2" -ForegroundColor White
        
        if ($First2 -ne $Last1) {
            Write-Host "   ✅ No duplicate at boundary (keyset stable)" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Duplicate detected at boundary" -ForegroundColor Red
        }
    } else {
        Write-Host "   ⚠️ No cursor returned (single page or error)" -ForegroundColor Yellow
    }
    Write-Host ""
    
    # 5. Response headers check
    Write-Host "5. Response headers check..." -ForegroundColor Yellow
    $CacheControl = $Response1.Headers['Cache-Control']
    $XDuration = $Response1.Headers['X-Query-Duration-ms']
    
    Write-Host "   Cache-Control: $CacheControl" -ForegroundColor White
    Write-Host "   X-Query-Duration-ms: $XDuration" -ForegroundColor White
    if ($CacheControl) {
        Write-Host "   ✅ Cache headers present" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ Cache headers missing" -ForegroundColor Yellow
    }
    Write-Host ""
    
} catch {
    Write-Host "   ❌ Error: $_" -ForegroundColor Red
    Write-Host ""
}

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""

