# Production Deployment Script
# Automatizuje SSH prihlásenie a deployment na produkciu
#
# Použitie:
#   .\deploy-production.ps1
#   alebo s explicitným heslom:
#   $env:SSH_PASSWORD="sfdsfae"; .\deploy-production.ps1

param(
    [string]$ServerIP = "89.185.250.213",
    [string]$User = "root",
    [string]$Password = $env:SSH_PASSWORD,
    [string]$RemotePath = "/var/www/premarketprice"
)

# SSH príkaz pre pripojenie
$sshCommand = @"
cd $RemotePath
git pull origin main
npm ci
npx prisma generate
npm run build
pm2 restart premarketprice --update-env
"@

Write-Host "🚀 Starting deployment to $User@$ServerIP..." -ForegroundColor Cyan
Write-Host ""

# Metóda 1: Použiť sshpass (ak je nainštalovaný)
if ($Password) {
    Write-Host "📝 Using sshpass with password..." -ForegroundColor Yellow
    
    # Kontrola, či je sshpass dostupný
    $sshpassAvailable = Get-Command sshpass -ErrorAction SilentlyContinue
    
    if ($sshpassAvailable) {
        # Windows: sshpass možno nie je dostupný, skúsime iný prístup
        Write-Host "⚠️  sshpass not commonly available on Windows" -ForegroundColor Yellow
        Write-Host "💡 Consider using SSH key instead (more secure)" -ForegroundColor Yellow
        Write-Host ""
    }
    
    # Alternatíva: Použiť plink (PuTTY) alebo vytvoriť expect script
    Write-Host "💡 Recommended: Use SSH key authentication instead" -ForegroundColor Green
    Write-Host ""
}

# Metóda 2: Použiť SSH kľúč (odporúčané)
Write-Host "🔑 Using SSH key authentication (recommended)..." -ForegroundColor Green
Write-Host ""

# Spustenie príkazov cez SSH
$commands = @(
    "cd $RemotePath",
    "git pull origin main",
    "npm ci",
    "npx prisma generate",
    "npm run build",
    "pm2 restart premarketprice --update-env"
)

$commandString = $commands -join " && "

Write-Host "📋 Executing commands:" -ForegroundColor Cyan
foreach ($cmd in $commands) {
    Write-Host "   $cmd" -ForegroundColor Gray
}
Write-Host ""

# Spustenie cez SSH
try {
    ssh "$User@$ServerIP" $commandString
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Deployment successful!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ Deployment failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error during deployment: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Tip: Make sure you have SSH key set up or use sshpass" -ForegroundColor Yellow
    exit 1
}
