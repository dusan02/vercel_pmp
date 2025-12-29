# 🔧 OPRAVA TPL, STZ, NOW - PRE POWERSHELL (lokálne testovanie)
# Poznámka: Tieto príkazy sú pre lokálne testovanie v PowerShell
# Na produkčnom serveri použite bash verziu z FIX_TPL_STZ_NOW_SSH_BASH.txt

Write-Host "=== 1. AKTUÁLNE HODNOTY ===" -ForegroundColor Cyan
$query1 = "SELECT `"symbol`", `"name`", `"sector`", `"industry`" FROM `"Ticker`" WHERE `"symbol`" IN ('TPL', 'STZ', 'NOW') ORDER BY `"symbol`";"
$query1 | npx prisma db execute --stdin

Write-Host ""
Write-Host "=== 2. APLIKOVANIE OPRAV ===" -ForegroundColor Cyan

Write-Host "Opravujem TPL..." -ForegroundColor Yellow
$updateTPL = "UPDATE `"Ticker`" SET `"sector`" = 'Real Estate', `"industry`" = 'REIT - Specialty', `"updatedAt`" = datetime('now') WHERE `"symbol`" = 'TPL';"
$updateTPL | npx prisma db execute --stdin

Write-Host "Opravujem STZ..." -ForegroundColor Yellow
$updateSTZ = "UPDATE `"Ticker`" SET `"sector`" = 'Consumer Defensive', `"industry`" = 'Beverages - Alcoholic', `"updatedAt`" = datetime('now') WHERE `"symbol`" = 'STZ';"
$updateSTZ | npx prisma db execute --stdin

Write-Host "Opravujem NOW..." -ForegroundColor Yellow
$updateNOW = "UPDATE `"Ticker`" SET `"sector`" = 'Technology', `"industry`" = 'Software', `"updatedAt`" = datetime('now') WHERE `"symbol`" = 'NOW';"
$updateNOW | npx prisma db execute --stdin

Write-Host ""
Write-Host "=== 3. OVERENIE OPRAV ===" -ForegroundColor Cyan
$query2 = "SELECT `"symbol`", `"name`", `"sector`", `"industry`" FROM `"Ticker`" WHERE `"symbol`" IN ('TPL', 'STZ', 'NOW') ORDER BY `"symbol`";"
$query2 | npx prisma db execute --stdin

Write-Host ""
Write-Host "✅ Oprava dokončená!" -ForegroundColor Green

