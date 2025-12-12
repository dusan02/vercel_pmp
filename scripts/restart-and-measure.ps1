# PowerShell script to restart application, start workers, and measure execution time
# Usage: .\scripts\restart-and-measure.ps1

$ErrorActionPreference = "Continue"

Write-Host "`n" -NoNewline
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " APPLICATION RESTART & PERFORMANCE MEASUREMENT" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# Step 1: Kill existing processes on port 3000
Write-Host "`n[Step 1] Stopping existing processes on port 3000..." -ForegroundColor Yellow
try {
    $processes = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $processes) {
        Write-Host "  Killing process $pid..." -ForegroundColor Gray
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Host "OK: Port 3000 cleared" -ForegroundColor Green
} catch {
    Write-Host "OK: No processes found on port 3000" -ForegroundColor Green
}

# Step 1.5: Clear Next.js cache
Write-Host "`n[Step 1.5] Clearing Next.js cache (.next folder)..." -ForegroundColor Yellow
if (Test-Path ".next") {
    try {
        Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "OK: Cache cleared" -ForegroundColor Green
    } catch {
        Write-Host "WARNING: Could not fully clear cache (files might be locked), continuing..." -ForegroundColor Gray
    }
} else {
    Write-Host "OK: Cache already clean" -ForegroundColor Green
}

# Step 2: Start Next.js app
Write-Host "`n[Step 2] Starting Next.js application (Standard Dev Server)..." -ForegroundColor Cyan
$appStartTime = Get-Date
$appJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev:next:no-turbopack
}

# Wait for app to be ready
Write-Host "WAIT: Waiting for app to start..." -ForegroundColor Yellow
$appReady = $false
$maxWait = 120
$waited = 0

while (-not $appReady -and $waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $appReady = $true
            $appReadyTime = Get-Date
            $appDuration = ($appReadyTime - $appStartTime).TotalSeconds
            Write-Host "OK: Next.js app is ready (${appDuration}s)" -ForegroundColor Green
            break
        }
    } catch {
        # Still waiting
    }
    
    if ($waited % 10 -eq 0) {
        Write-Host "  Still waiting... (${waited}s)" -ForegroundColor Gray
    }
}

if (-not $appReady) {
    Write-Host "WARNING: App startup timeout, assuming ready..." -ForegroundColor Yellow
    $appReadyTime = Get-Date
    $appDuration = ($appReadyTime - $appStartTime).TotalSeconds
}

# Step 3: Wait for app to stabilize
Write-Host "`n[Step 3] Waiting 10s for app to stabilize..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Step 4: Start workers
Write-Host "`n[Step 4] Starting workers..." -ForegroundColor Cyan

# Start refs worker
Write-Host "  Starting refs worker..." -ForegroundColor Gray
$refsStartTime = Get-Date
$refsJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    node scripts/start-worker-refs.js
}

Start-Sleep -Seconds 3

# Start snapshot worker
Write-Host "  Starting snapshot worker..." -ForegroundColor Gray
$snapshotStartTime = Get-Date
$snapshotJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    node scripts/start-worker-snapshot.js
}

# Step 5: Monitor workers
Write-Host "`n[Step 5] Monitoring workers..." -ForegroundColor Cyan
$monitoringStart = Get-Date
$refsDone = $false
$snapshotDone = $false
$maxMonitoringTime = 600 # 10 minutes
$monitoringElapsed = 0
$checkInterval = 3

while ($monitoringElapsed -lt $maxMonitoringTime) {
    Start-Sleep -Seconds $checkInterval
    $monitoringElapsed += $checkInterval
    
    # Check refs worker output
    if (-not $refsDone) {
        $refsOutput = Receive-Job -Job $refsJob -ErrorAction SilentlyContinue
        if ($refsOutput -match "Universe refreshed|Previous closes bootstrapped|Refs worker completed") {
            $refsDone = $true
            $refsEndTime = Get-Date
            $refsDuration = ($refsEndTime - $refsStartTime).TotalSeconds
            Write-Host "`nOK: Refs worker completed first cycle in ${refsDuration}s" -ForegroundColor Green
        }
    }
    
    # Check snapshot worker output
    if (-not $snapshotDone) {
        $snapshotOutput = Receive-Job -Job $snapshotJob -ErrorAction SilentlyContinue
        if ($snapshotOutput -match "Snapshot worker completed|hasSuccess = true|Processing complete") {
            $snapshotDone = $true
            $snapshotEndTime = Get-Date
            $snapshotDuration = ($snapshotEndTime - $snapshotStartTime).TotalSeconds
            Write-Host "`nOK: Snapshot worker completed first cycle in ${snapshotDuration}s" -ForegroundColor Green
        }
    }
    
    # Show progress every 30 seconds
    if ($monitoringElapsed % 30 -eq 0) {
        $refsStatus = if ($refsDone) { "OK" } else { "WAIT" }
        $snapshotStatus = if ($snapshotDone) { "OK" } else { "WAIT" }
        Write-Host "`nElapsed: ${monitoringElapsed}s | Refs: $refsStatus | Snapshot: $snapshotStatus" -ForegroundColor Yellow
    }
    
    # Both done?
    if ($refsDone -and $snapshotDone) {
        Write-Host "`nOK: Both workers completed their first cycles!" -ForegroundColor Green
        break
    }
}

# Step 6: Observe for additional time
Write-Host "`n[Step 6] Observing workers for 60s..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

# Step 7: Generate report
Write-Host "`n[Step 7] Generating report..." -ForegroundColor Cyan

$reportTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$totalMonitoringTime = ($monitoringElapsed).ToString("F2")
$appDurationStr = ($appDuration).ToString("F2")

$report = @"
================================================================================
APPLICATION RESTART & PERFORMANCE REPORT
================================================================================

Generated: $reportTime

--------------------------------------------------------------------------------
APPLICATION STARTUP
--------------------------------------------------------------------------------
App startup time: ${appDurationStr}s
Start time: $($appStartTime.ToString("yyyy-MM-dd HH:mm:ss"))
Ready time: $($appReadyTime.ToString("yyyy-MM-dd HH:mm:ss"))
URL: http://localhost:3000

--------------------------------------------------------------------------------
WORKERS PERFORMANCE
--------------------------------------------------------------------------------

REFS Worker:
  First cycle time: $(if ($refsDone) { "$($refsDuration.ToString("F2"))s" } else { "N/A (still running)" })
  Started: $($refsStartTime.ToString("yyyy-MM-dd HH:mm:ss"))
  Completed: $(if ($refsDone) { "$($refsEndTime.ToString("yyyy-MM-dd HH:mm:ss"))" } else { "N/A" })
  Status: $(if ($refsDone) { "Completed" } else { "Still running (continuous)" })

SNAPSHOT Worker:
  First cycle time: $(if ($snapshotDone) { "$($snapshotDuration.ToString("F2"))s" } else { "N/A (still running)" })
  Started: $($snapshotStartTime.ToString("yyyy-MM-dd HH:mm:ss"))
  Completed: $(if ($snapshotDone) { "$($snapshotEndTime.ToString("yyyy-MM-dd HH:mm:ss"))" } else { "N/A" })
  Status: $(if ($snapshotDone) { "Completed" } else { "Still running (continuous)" })

--------------------------------------------------------------------------------
SUMMARY
--------------------------------------------------------------------------------
Total monitoring time: ${totalMonitoringTime}s
Refs worker: $(if ($refsDone) { "Completed" } else { "Running" })
Snapshot worker: $(if ($snapshotDone) { "Completed" } else { "Running" })

$(if ($refsDone -and $snapshotDone) {
  "All workers completed successfully!"
  "Refs cycle: $($refsDuration.ToString("F2"))s"
  "Snapshot cycle: $($snapshotDuration.ToString("F2"))s"
})

================================================================================
"@

Write-Host $report -ForegroundColor White

# Save report to file
$reportPath = Join-Path $PWD "RESTART_REPORT.md"
$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host "`nReport saved to: $reportPath" -ForegroundColor Green

Write-Host "`nMeasurement complete! Application and workers are still running." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop all processes, or close this window." -ForegroundColor Yellow
Write-Host "`nApplication running at: http://localhost:3000" -ForegroundColor Cyan

# Keep running
Write-Host "`nKeeping processes running... (Press Ctrl+C to stop)" -ForegroundColor Gray
try {
    while ($true) {
        Start-Sleep -Seconds 10
        
        # Check if jobs are still running
        if ($appJob.State -eq "Failed" -or $appJob.State -eq "Completed") {
            Write-Host "WARNING: App job stopped (State: $($appJob.State))" -ForegroundColor Yellow
        }
        if ($refsJob.State -eq "Failed" -or $refsJob.State -eq "Completed") {
            Write-Host "WARNING: Refs worker stopped (State: $($refsJob.State))" -ForegroundColor Yellow
        }
        if ($snapshotJob.State -eq "Failed" -or $snapshotJob.State -eq "Completed") {
            Write-Host "WARNING: Snapshot worker stopped (State: $($snapshotJob.State))" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "`nStopping all processes..." -ForegroundColor Yellow
    
    Stop-Job -Job $appJob -ErrorAction SilentlyContinue
    Stop-Job -Job $refsJob -ErrorAction SilentlyContinue
    Stop-Job -Job $snapshotJob -ErrorAction SilentlyContinue
    
    Remove-Job -Job $appJob -ErrorAction SilentlyContinue
    Remove-Job -Job $refsJob -ErrorAction SilentlyContinue
    Remove-Job -Job $snapshotJob -ErrorAction SilentlyContinue
    
    Write-Host "OK: All processes stopped" -ForegroundColor Green
}
