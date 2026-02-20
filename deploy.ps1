# PowerShell script for automated deployment via SSH
# Usage: .\deploy.ps1

param(
    [string]$Server = "root@89.185.250.213",
    [string]$Password = "CcO15gcCwu",
    [string]$RemotePath = "/var/www/premarketprice"
)

Write-Host "🚀 Starting automated deployment..." -ForegroundColor Green
Write-Host ""

# Check for required tools
$hasSshpass = Get-Command sshpass -ErrorAction SilentlyContinue
$hasPlink = Get-Command plink -ErrorAction SilentlyContinue

# Construct the remote command
$RemoteCommand = "cd $RemotePath && git pull origin main && npm ci && npx prisma generate && npm run build && pm2 restart premarketprice --update-env"

if ($hasSshpass) {
    Write-Host "🔐 Using sshpass..." -ForegroundColor Green
    sshpass -p $Password ssh -o StrictHostKeyChecking=no $Server $RemoteCommand
}
elseif ($hasPlink) {
    Write-Host "🔐 Using plink (PuTTY)..." -ForegroundColor Green
    echo y | plink -ssh $Server -pw $Password $RemoteCommand
}
else {
    Write-Host "⚠️ No automated tool (sshpass/plink) found." -ForegroundColor Yellow
    Write-Host "Run this command manually:" -ForegroundColor Cyan
    Write-Host "ssh $Server '$RemoteCommand'" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
