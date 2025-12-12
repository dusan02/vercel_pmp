# PowerShell script to clear Next.js cache
# Usage: .\scripts\clear-cache.ps1

Write-Host "🛑 Stopping Node.js processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "🗑️  Removing .next directory..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
    Write-Host "✅ .next directory removed" -ForegroundColor Green
} else {
    Write-Host "ℹ️  .next directory does not exist" -ForegroundColor Cyan
}

Write-Host "🗑️  Removing node_modules/.cache..." -ForegroundColor Yellow
if (Test-Path "node_modules/.cache") {
    Remove-Item -Recurse -Force node_modules/.cache -ErrorAction SilentlyContinue
    Write-Host "✅ node_modules/.cache removed" -ForegroundColor Green
}

Write-Host "✅ Cache cleared! You can now restart the server with: npm run dev:next" -ForegroundColor Green

