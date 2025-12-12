Write-Host "Creating .env.local file..." -ForegroundColor Green
Write-Host ""

$envContent = @"
# Polygon.io API Key - Get your free key at https://polygon.io/
# 1. Go to https://polygon.io/
# 2. Sign up for a free account
# 3. Get your API key from the dashboard
# 4. Replace 'your_actual_api_key_here' with your real API key
POLYGON_API_KEY=your_actual_api_key_here

# Redis Configuration (optional - app works without Redis)
REDIS_URL=redis://localhost:6379

# Database Configuration
DATABASE_URL=file:./data/premarket.db

# Next.js Configuration
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000
"@

$envContent | Out-File -FilePath ".env.local" -Encoding UTF8

Write-Host ".env.local file created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Edit .env.local and replace 'your_actual_api_key_here' with your real Polygon.io API key" -ForegroundColor White
Write-Host "2. Restart the application with: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Setup complete!" 