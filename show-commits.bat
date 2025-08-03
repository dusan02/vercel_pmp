@echo off
echo 📋 Recent commits:
echo.
git log --oneline -20
echo.
echo.
echo 🔄 To revert to yesterday's version:
echo 1. Find the commit hash from yesterday
echo 2. Run: git reset --hard COMMIT_HASH
echo 3. Run: git push --force origin main
echo.
pause 