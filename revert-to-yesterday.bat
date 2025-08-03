@echo off
echo 🔄 Reverting to yesterday's working version...
echo.
echo Commit: 38d0028 - Update after-hours trading hours
echo.
echo 1. Resetting to yesterday's commit...
git reset --hard 38d0028

echo.
echo 2. Force pushing to GitHub...
git push --force origin main

echo.
echo ✅ Reverted to yesterday's working version!
echo 🎯 Check Vercel for automatic deployment...
pause 