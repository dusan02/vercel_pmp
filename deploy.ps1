# Simple Deployment Script
# Použitie: .\deploy.ps1

param(
    [string]$Password = $env:SSH_PASSWORD
)

$SERVER = "89.185.250.213"
$USER = "root"
$REMOTE_PATH = "/var/www/premarketprice"

Write-Host "🚀 Deploying to production..." -ForegroundColor Cyan
Write-Host ""

# Ak nie je heslo v env, požiadaj oň
if (-not $Password) {
    Write-Host "💡 Tip: Set SSH_PASSWORD environment variable to skip this prompt" -ForegroundColor Yellow
    $securePassword = Read-Host "Enter SSH password" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

# Príkazy na spustenie
$commands = @(
    "cd $REMOTE_PATH",
    "git pull origin main",
    "npm ci",
    "npx prisma generate",
    "npm run build",
    "pm2 restart premarketprice --update-env"
)

$commandString = $commands -join " && "

Write-Host "📋 Commands:" -ForegroundColor Cyan
foreach ($cmd in $commands) {
    Write-Host "   $cmd" -ForegroundColor Gray
}
Write-Host ""

# Skúsime použiť sshpass (ak je dostupný v Git Bash/WSL)
$useWSL = $false
if (Get-Command wsl -ErrorAction SilentlyContinue) {
    Write-Host "🔍 Detected WSL, using it for SSH..." -ForegroundColor Yellow
    $useWSL = $true
}

if ($useWSL) {
    # Použiť WSL s sshpass
    $wslCommands = @"
export SSH_PASSWORD='$Password'
cd /mnt/d/Projects/Vercel_PMP/pmp_prod
./deploy-production.sh
"@
    
    wsl bash -c $wslCommands
} else {
    # Fallback: Zobraziť príkazy na manuálne spustenie
    Write-Host "⚠️  Automatic deployment requires one of:" -ForegroundColor Yellow
    Write-Host "   1. SSH key setup (recommended)" -ForegroundColor Cyan
    Write-Host "   2. WSL with sshpass installed" -ForegroundColor Cyan
    Write-Host "   3. Git Bash with sshpass" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 Run these commands manually:" -ForegroundColor Yellow
    Write-Host "   ssh $USER@$SERVER" -ForegroundColor White
    Write-Host "   (password: $Password)" -ForegroundColor Gray
    Write-Host ""
    foreach ($cmd in $commands) {
        Write-Host "   $cmd" -ForegroundColor White
    }
}
