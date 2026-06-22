Set-Location 'C:\Users\youso\cs-skin-futures'

Remove-Item -Force -ErrorAction SilentlyContinue '.git\index.lock'
Remove-Item -Force -ErrorAction SilentlyContinue '.git\HEAD.lock'

git add -A
git commit -m "fix: logout bug, skin-price 503s, img proxy 502s, AWP/AK47 index images"
git push origin main

Write-Host "DONE" -ForegroundColor Green
Read-Host "Press Enter to close"
