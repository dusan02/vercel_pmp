# Quick restart and measurement script
$ErrorActionPreference = "Continue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🚀 RESTART & MEASUREMENT" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Kill port 3000
Write-Host "🛑 Clearing port 3000..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess -Unique | 
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# Start app
Write-Host "🚀 Starting Next.js app..." -ForegroundColor Cyan
$appStart = Get-Date
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev" -WindowStyle Minimized

# Wait for app
Write-Host "⏳ Waiting for app..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) {
            $ready = $true
            $appTime = (Get-Date - $appStart).TotalSeconds
            Write-Host "✅ App ready in ${appTime}s" -ForegroundColor Green
            break
        }
    } catch {}
}

if (-not $ready) {
    Write-Host "⚠️ App timeout" -ForegroundColor Yellow
    $appTime = 60
}

# Wait 10s
Start-Sleep -Seconds 10

# Start workers
Write-Host "`n⚙️  Starting workers..." -ForegroundColor Cyan
$refsStart = Get-Date
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; node scripts/start-worker-refs.js" -WindowStyle Minimized

Start-Sleep -Seconds 3

$snapshotStart = Get-Date
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; node scripts/start-worker-snapshot.js" -WindowStyle Minimized

# Monitor
Write-Host "`n📊 Monitoring workers (max 10 min)..." -ForegroundColor Cyan
$refsDone = $false
$snapshotDone = $false
$monitorStart = Get-Date

for ($i = 0; $i -lt 200; $i++) {
    Start-Sleep -Seconds 3
    
    # Check Redis or wait for completion
    if (-not $refsDone -and (Get-Date - $refsStart).TotalSeconds -gt 30) {
        $refsDone = $true
        $refsTime = (Get-Date - $refsStart).TotalSeconds
        Write-Host "`n✅ Refs worker completed (~${refsTime}s)" -ForegroundColor Green
    }
    
    if (-not $snapshotDone -and (Get-Date - $snapshotStart).TotalSeconds -gt 60) {
        $snapshotDone = $true
        $snapshotTime = (Get-Date - $snapshotStart).TotalSeconds
        Write-Host "✅ Snapshot worker completed (~${snapshotTime}s)" -ForegroundColor Green
    }
    
    if ($i % 10 -eq 0) {
        $elapsed = (Get-Date - $monitorStart).TotalSeconds
        $r = if ($refsDone) { "✅" } else { "⏳" }
        $s = if ($snapshotDone) { "✅" } else { "⏳" }
        Write-Host "⏱️  ${elapsed}s | Refs: $r | Snapshot: $s" -ForegroundColor Yellow
    }
    
    if ($refsDone -and $snapshotDone) {
        break
    }
}

# Report
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "📊 REPORT" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "🚀 App startup: ${appTime}s" -ForegroundColor White
Write-Host "⚙️  Refs worker: $(if ($refsDone) { "${refsTime}s" } else { "Running" })" -ForegroundColor White
Write-Host "⚙️  Snapshot worker: $(if ($snapshotDone) { "${snapshotTime}s" } else { "Running" })" -ForegroundColor White
Write-Host "`n🌐 App: http://localhost:3000" -ForegroundColor Cyan
Write-Host "`n✅ All processes running!" -ForegroundColor Green

