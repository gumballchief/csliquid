Set-Location 'C:\Users\youso\cs-skin-futures'

# Remove git locks
Remove-Item -Force -ErrorAction SilentlyContinue '.git\index.lock'
Remove-Item -Force -ErrorAction SilentlyContinue '.git\HEAD.lock'

# Deploy all fixes this session:
#   - allMarkets.ts: index iconUrls -> cdn.cloudflare.steamstatic.com
#   - trade/page.tsx: MarketIcon loads images directly, K/M/B price format
#   - api/img/route.ts: allowlist += cdn.cloudflare.steamstatic.com
#   - SkinCard.tsx / indices/page.tsx / TradeTicket.tsx: K/M/B format
#   - PriceTicker.tsx / page.tsx: K/M/B format in ticker + homepage cards
#   - skinPriceService.ts: deriveChange requires 30min-old snapshot before
#     using it as 24h baseline (prevents 100%+ false swings on fresh load)
git add -A
git commit -m "fix: CDN images, K/M/B prices site-wide, suppress false 24h% swings on fresh load"
git push origin main

Write-Host "DONE" -ForegroundColor Green
Read-Host "Press Enter to close"
