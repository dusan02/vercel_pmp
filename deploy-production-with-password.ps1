# Production Deployment Script with Password
# Používa expect-like prístup cez plink (PuTTY) alebo sshpass
#
# Použitie:
#   .\deploy-production-with-password.ps1
#   alebo:
#   .\deploy-production-with-password.ps1 -Password "sfdsfae"

param(
    [string]$ServerIP = "89.185.250.213",
    [string]$User = "root",
    [Parameter(Mandatory=$false)]
    [string]$Password = $env:SSH_PASSWORD,
    [string]$RemotePath = "/var/www/premarketprice"
)

if (-not $Password) {
    $Password = Read-Host "Enter SSH password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

Write-Host "🚀 Starting deployment to $User@$ServerIP..." -ForegroundColor Cyan
Write-Host ""

# Vytvorenie dočasného script súboru
$tempScript = [System.IO.Path]::GetTempFileName()
$scriptContent = @"
cd $RemotePath
git pull origin main
npm ci
npx prisma generate
npm run build
pm2 restart premarketprice --update-env
"@

$scriptContent | Out-File -FilePath $tempScript -Encoding UTF8

try {
    # Metóda 1: Použiť plink (PuTTY) - ak je nainštalovaný
    $plinkPath = Get-Command plink -ErrorAction SilentlyContinue
    
    if ($plinkPath) {
        Write-Host "📝 Using plink (PuTTY)..." -ForegroundColor Yellow
        $commands = Get-Content $tempScript -Raw
        echo y | plink -ssh -pw "$Password" "$User@$ServerIP" "$commands"
    }
    # Metóda 2: Použiť sshpass (ak je dostupný v WSL alebo Git Bash)
    elseif (Get-Command sshpass -ErrorAction SilentlyContinue) {
        Write-Host "📝 Using sshpass..." -ForegroundColor Yellow
        $commands = Get-Content $tempScript -Raw
        sshpass -p "$Password" ssh -o StrictHostKeyChecking=no "$User@$ServerIP" $commands
    }
    # Metóda 3: Použiť expect-like prístup cez here-string
    else {
        Write-Host "📝 Using SSH with password (manual method)..." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "⚠️  Password authentication via SSH is not directly supported in PowerShell" -ForegroundColor Yellow
        Write-Host "💡 Recommended solutions:" -ForegroundColor Green
        Write-Host "   1. Use SSH key (most secure): ssh-keygen, then ssh-copy-id $User@$ServerIP" -ForegroundColor Cyan
        Write-Host "   2. Install sshpass in WSL/Git Bash and use deploy-production.sh" -ForegroundColor Cyan
        Write-Host "   3. Use plink (PuTTY) for Windows" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "📋 Commands to run manually:" -ForegroundColor Yellow
        Write-Host "   ssh $User@$ServerIP" -ForegroundColor Gray
        foreach ($line in $scriptContent -split "`n") {
            if ($line.Trim()) {
                Write-Host "   $($line.Trim())" -ForegroundColor Gray
            }
        }
        exit 1
    }
    
    Write-Host ""
    Write-Host "✅ Deployment successful!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "❌ Error during deployment: $_" -ForegroundColor Red
    exit 1
} finally {
    # Vymazať dočasný súbor
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force
    }
}
