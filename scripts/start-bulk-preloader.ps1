# PowerShell script to start bulk preloader worker manually
# Usage: .\scripts\start-bulk-preloader.ps1

$ErrorActionPreference = "Stop"

# Change to project root
Set-Location $PSScriptRoot\..

# Check if POLYGON_API_KEY is set
if (-not $env:POLYGON_API_KEY) {
    Write-Host "❌ POLYGON_API_KEY not set. Please set it in .env or as environment variable." -ForegroundColor Red
    exit 1
}

# Run the preloader
Write-Host "🚀 Starting bulk preloader..." -ForegroundColor Cyan
npx ts-node src/workers/backgroundPreloader.ts

