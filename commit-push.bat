@echo off
cd /d "C:\Users\youso\cs-skin-futures"

rem Kill any lingering git processes
taskkill /f /im git.exe >nul 2>&1

rem Remove stale git lock files using PowerShell (more reliable than del)
powershell -Command "Remove-Item -Force -ErrorAction SilentlyContinue '.git\index.lock', '.git\HEAD.lock'"

rem Wait a moment
timeout /t 1 /nobreak >nul

git add src/app/api/airdrop/route.ts src/components/ui/AirdropSyncer.tsx src/contexts/AuthContext.tsx src/store/positionsStore.ts src/app/api/prices/route.ts src/lib/priceCache.ts

git commit -m "fix: SOL re-seed for existing users + auth key collision + CS500 stability"

git push origin main

echo.
echo Done! Check Vercel for deployment.
pause
