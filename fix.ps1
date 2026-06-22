Set-Location 'C:\Users\youso\cs-skin-futures'

Remove-Item -Force -ErrorAction SilentlyContinue '.git\index.lock'
Remove-Item -Force -ErrorAction SilentlyContinue '.git\HEAD.lock'

git add -A
git commit -m "feat: real Steam images for all 35 markets, K/M/B prices, fix 24h% swings"
git push origin main

Write-Host "DONE" -ForegroundColor Green
Read-Host "Press Enter to close"
