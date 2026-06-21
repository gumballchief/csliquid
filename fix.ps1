Set-Location 'C:\Users\youso\cs-skin-futures'
Remove-Item -Force -ErrorAction SilentlyContinue '.git\index.lock'
Remove-Item -Force -ErrorAction SilentlyContinue '.git\HEAD.lock'
git add -A
git commit -m "feat: markets page, 30 new perps (DEMO), rewards/daily-case-roll, indices page, prize pool overhaul, nav links"
git push origin main
Write-Host "DONE" -ForegroundColor Green
Read-Host "Press Enter to close"
