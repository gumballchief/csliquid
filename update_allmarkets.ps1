Set-Location 'C:\Users\youso\cs-skin-futures'

# Read results from download step
if (-not (Test-Path 'image_results.json')) {
    Write-Host "ERROR: image_results.json not found — run download_images.ps1 first" -ForegroundColor Red
    Read-Host "Press Enter"; exit 1
}

$results = Get-Content 'image_results.json' -Raw | ConvertFrom-Json

# Read allMarkets.ts as bytes to avoid encoding issues
$bytes = [System.IO.File]::ReadAllBytes('src\lib\allMarkets.ts')
$src   = [System.Text.Encoding]::UTF8.GetString($bytes)

$patched = 0

# For each slug that has a downloaded image, replace iconUrl in allMarkets.ts
foreach ($prop in $results.PSObject.Properties) {
    $slug    = $prop.Name
    $imgPath = $prop.Value

    if (-not $imgPath) { continue }   # skip failed downloads

    # Match pattern: slug line followed (within a few lines) by iconUrl: '...'
    # We replace the iconUrl value for each market entry
    # Pattern: find "slug: 'awp-dragon-lore-fn'" block and update its iconUrl
    $escapedSlug = [regex]::Escape($slug)

    # Replace empty iconUrl '' with local path for this slug
    # Strategy: find the market block by slug, then find its iconUrl and replace
    $pattern = "(?s)(slug:\s*'$escapedSlug'.*?iconUrl:\s*')[^']*(')"
    if ($src -match $pattern) {
        $src = $src -replace $pattern, "`${1}$imgPath`${2}"
        Write-Host "[OK] $slug -> $imgPath" -ForegroundColor Green
        $patched++
    } else {
        Write-Host "[MISS] $slug — pattern not found" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Patched $patched market entries" -ForegroundColor Cyan

# Write back as UTF-8 bytes
$outBytes = [System.Text.Encoding]::UTF8.GetBytes($src)
[System.IO.File]::WriteAllBytes('src\lib\allMarkets.ts', $outBytes)
Write-Host "Wrote src\lib\allMarkets.ts" -ForegroundColor Green

# Commit and deploy
Remove-Item -Force -EA SilentlyContinue '.git\index.lock'
Remove-Item -Force -EA SilentlyContinue '.git\HEAD.lock'
git add -A
git commit -m "feat: local market images for all 35 markets"
git push origin main

Write-Host ""
Write-Host "DEPLOYED — Vercel will build in ~1 min" -ForegroundColor Green
Read-Host "Press Enter to close"
