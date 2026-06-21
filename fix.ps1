Set-Location 'C:\Users\youso\cs-skin-futures'
Remove-Item -Force -ErrorAction SilentlyContinue '.git\index.lock'
Remove-Item -Force -ErrorAction SilentlyContinue '.git\HEAD.lock'
git add -A
git commit -m "fix: DEMO trade form blocked, React #329 error boundary, on-chain tx verification for leaderboard, rewards roll-status persist, DEMO skin prices, API input sanitization"
git push origin main
Write-Host "DONE" -ForegroundColor Green
Read-Host "Press Enter to close"
