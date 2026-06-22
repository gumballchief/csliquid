Set-Location 'C:\Users\youso\cs-skin-futures'

Remove-Item -Force -ErrorAction SilentlyContinue '.git\index.lock'
Remove-Item -Force -ErrorAction SilentlyContinue '.git\HEAD.lock'

git add -A
git commit -m "fix: logout phantom auto-reconnect, rewards eligibility (any trade not $100 today)"
git push origin main

Write-Host "DONE" -ForegroundColor Green
Read-Host "Press Enter to close"
