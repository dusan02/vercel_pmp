# PowerShell script pre automatizované nasadenie cez SSH
# Použitie: .\deploy.ps1

param(
    [string]$Server = "root@89.185.250.213",
    [string]$Password = "CcO15gcCwu",
    [string]$RemotePath = "/var/www/premarketprice"
)

Write-Host "🚀 Začínam automatizované nasadenie..." -ForegroundColor Green
Write-Host ""

# Kontrola, či je nainštalovaný sshpass alebo expect
$hasSshpass = Get-Command sshpass -ErrorAction SilentlyContinue
$hasPlink = Get-Command plink -ErrorAction SilentlyContinue

if (-not $hasSshpass -and -not $hasPlink) {
    Write-Host "⚠️  Pre automatizáciu hesla potrebujete sshpass alebo plink (PuTTY)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Možnosti:" -ForegroundColor Cyan
    Write-Host "1. Nainštalujte sshpass (pre Git Bash/WSL):" -ForegroundColor White
    Write-Host "   - Windows: choco install sshpass" -ForegroundColor Gray
    Write-Host "   - Alebo použite WSL: apt-get install sshpass" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Použite SSH kľúče namiesto hesla (odporúčané):" -ForegroundColor White
    Write-Host "   ssh-copy-id $Server" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Spustite manuálne:" -ForegroundColor White
    Write-Host "   ssh $Server" -ForegroundColor Gray
    Write-Host "   Potom na serveri: bash $RemotePath/deploy.sh" -ForegroundColor Gray
    Write-Host ""
    
    # Alternatíva: použiť expect-like prístup cez PowerShell
    Write-Host "📋 Alternatívne môžete skopírovať a spustiť tento príkaz:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ssh $Server 'cd $RemotePath && bash deploy.sh'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alebo použite tento jednoduchý príkaz:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ssh $Server `"cd $RemotePath; git pull origin main; npm ci; npx prisma generate; npm run build; pm2 restart premarketprice --update-env`"" -ForegroundColor Yellow
    Write-Host ""
    
    exit 1
}

# Upload deploy.sh na server (ak ešte nie je tam)
Write-Host "📤 Kontrolujem deploy.sh na serveri..." -ForegroundColor Cyan
$deployScript = Get-Content "deploy.sh" -Raw

# Spustenie deploymentu
if ($hasSshpass) {
    Write-Host "🔐 Používam sshpass pre automatizáciu..." -ForegroundColor Green
    # Use Invoke-Expression or direct call with careful quoting
    # Note: potential issues with pipe in PowerShell. Using simple command structure.
    sshpass -p $Password ssh -o StrictHostKeyChecking=no $Server "cd $RemotePath && git pull origin main && npm ci && npx prisma generate && npm run build && pm2 restart premarketprice --update-env"
}
elseif ($hasPlink) {
    Write-Host "🔐 Používam plink (PuTTY)..." -ForegroundColor Green
    echo y | plink -ssh $Server -pw $Password "cd $RemotePath && git pull origin main && npm ci && npx prisma generate && npm run build && pm2 restart premarketprice --update-env"
}
else {
    # Fallback: jednoduchý SSH príkaz
    Write-Host "📋 Spustite tento príkaz manuálne (vyžaduje heslo):" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "ssh $Server 'cd $RemotePath && git pull origin main && npm ci && npx prisma generate && npm run build && pm2 restart premarketprice --update-env'" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "✅ Hotovo!" -ForegroundColor Green
