# PowerShell script to manually trigger the daily refresh cron job
# Usage: .\scripts\trigger-daily-refresh.ps1 [-HardReset]
#
# This script calls the /api/cron/update-static-data endpoint
# with optional hard reset flag

param(
    [switch]$HardReset
)

# Load environment variables from .env.local
$envFile = Join-Path $PSScriptRoot "..\.env.local"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

$cronSecretKey = $env:CRON_SECRET_KEY
$baseUrl = if ($env:VERCEL_URL) { 
    "https://$($env:VERCEL_URL)" 
} elseif ($env:NEXT_PUBLIC_BASE_URL) {
    $env:NEXT_PUBLIC_BASE_URL
} else {
    "http://localhost:3000"
}

if (-not $cronSecretKey) {
    Write-Host "❌ CRON_SECRET_KEY not configured" -ForegroundColor Red
    exit 1
}

$url = "$baseUrl/api/cron/update-static-data"
if ($HardReset) {
    $url += "?hardReset=true"
}

Write-Host "🚀 Triggering daily refresh$(if ($HardReset) { ' (HARD RESET MODE)' })..." -ForegroundColor Cyan
Write-Host "📍 URL: $url" -ForegroundColor Gray

try {
    $headers = @{
        "Authorization" = "Bearer $cronSecretKey"
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -ErrorAction Stop

    Write-Host "`n✅ Daily refresh completed successfully!" -ForegroundColor Green
    Write-Host "`n📊 Results:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
} catch {
    Write-Host "`n❌ Error triggering daily refresh:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    exit 1
}
